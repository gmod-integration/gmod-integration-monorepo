import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import ts from 'typescript'

type Workspace = {
  id: string
  directory: string
  kind: 'app' | 'package'
  manifest: { name: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Parse actual imports instead of matching comments, strings or formatting with regexes. */
export function importSpecifiers(source: string): string[] {
  const imports: string[] = []
  const file = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return imports
}

export function usesProcessEnvironment(source: string): boolean {
  const file = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const processNames = new Set(['process'])
  let found = false
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      ['node:process', 'process'].includes(statement.moduleSpecifier.text)
    ) {
      if (statement.importClause?.name) processNames.add(statement.importClause.name.text)
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) processNames.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings)) {
        found ||= bindings.elements.some((element) => (element.propertyName || element.name).text === 'env')
      }
    }
  }
  function visit(node: ts.Node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      processNames.has(node.expression.text) &&
      node.name.text === 'env'
    )
      found = true
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      processNames.has(node.expression.text) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === 'env'
    )
      found = true
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      processNames.has(node.initializer.text) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.some((element) => (element.propertyName || element.name).getText(file) === 'env')
    )
      found = true
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

export function checkArchitecture(repoRoot: string): string[] {
  const workspaces: Workspace[] = []
  for (const [folder, kind] of [
    ['apps', 'app'],
    ['packages', 'package'],
  ] as const) {
    for (const entry of readdirSync(resolve(repoRoot, folder), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const directory = resolve(repoRoot, folder, entry.name)
      const manifestPath = resolve(directory, 'package.json')
      // The legacy API's manifest is still the root package.json.
      const manifest = folder === 'apps' && entry.name === 'api' ? resolve(repoRoot, 'package.json') : manifestPath
      if (!existsSync(manifest)) continue
      workspaces.push({
        id: `${folder}/${entry.name}`,
        directory,
        kind,
        manifest: JSON.parse(readFileSync(manifest, 'utf8')),
      })
    }
  }

  const errors = new Set<string>()
  const edges = new Map(workspaces.map(({ id }) => [id, new Set<string>()]))
  for (const workspace of workspaces) {
    const dependencies = { ...workspace.manifest.dependencies, ...workspace.manifest.devDependencies }
    for (const target of workspaces) {
      if (target.id !== workspace.id && dependencies[target.manifest.name]?.startsWith('workspace:')) {
        edges.get(workspace.id)!.add(target.id)
      }
    }

    for (const file of sourceFiles(resolve(workspace.directory, 'src'))) {
      const source = readFileSync(file, 'utf8')
      if (!['packages/config', 'apps/webhook-relay'].includes(workspace.id) && usesProcessEnvironment(source)) {
        errors.add(`${relative(repoRoot, file)}: read environment through @gmod/config instead of process.env.`)
      }
      for (const specifier of importSpecifiers(source)) {
        const absolute = specifier.startsWith('.') ? resolve(dirname(file), specifier) : null
        const target = workspaces.find((candidate) =>
          absolute
            ? absolute === candidate.directory || absolute.startsWith(candidate.directory + sep)
            : specifier === candidate.manifest.name || specifier.startsWith(candidate.manifest.name + '/'),
        )
        if (!target || target.id === workspace.id) continue
        edges.get(workspace.id)!.add(target.id)
        const location = relative(repoRoot, file)
        if (target.kind === 'app') {
          errors.add(
            `${location}: ${workspace.id} imports ${target.id}; app source must not be imported across workspaces.`,
          )
        }
        if (!absolute && !dependencies[target.manifest.name]?.startsWith('workspace:')) {
          errors.add(`${location}: declare ${target.manifest.name} as a workspace dependency of ${workspace.id}.`)
        }
      }
    }
  }

  const visited = new Set<string>()
  const active: string[] = []
  function visit(id: string) {
    const index = active.indexOf(id)
    if (index !== -1) {
      errors.add(`Workspace dependency cycle: ${[...active.slice(index), id].join(' → ')}`)
      return
    }
    if (visited.has(id)) return
    active.push(id)
    for (const dependency of edges.get(id)!) visit(dependency)
    active.pop()
    visited.add(id)
  }
  for (const { id } of workspaces) visit(id)
  return [...errors]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkArchitecture(fileURLToPath(new URL('../', import.meta.url)))
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('Workspace imports and dependency graph are valid.')
  }
}
