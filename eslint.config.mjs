import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      'logs/**',
      'packages/infra-prisma/generated/**',
      'apps/docs/build/**',
      'apps/docs/.docusaurus/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    files: ['apps/website/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@fortawesome/*', 'font-awesome', 'fontawesome'],
              message: 'Use the shared Lucide Icon registry in components/ui/Icon.tsx.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/website/src/pages/dashboard/**/*.tsx'],
    ignores: ['apps/website/src/pages/dashboard/guilds/servers/screenshots/FocusImg.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='i'] > JSXAttribute[name.name='onClick']",
          message: 'Use IconButton from components/ui for named, keyboard-accessible actions.',
        },
        {
          selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='class'][value.value=/\\bbtn\\b/]",
          message: 'Use Button or IconButton from components/ui instead of copying dashboard button classes.',
        },
      ],
    },
  },
  {
    // apps/webhook-relay ships as its own image with its own three env vars (see
    // docs/apps/webhook-relay.md). One @gmod/* import would drag in @gmod/config's whole-stack env
    // validation and break that.
    files: ['apps/webhook-relay/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gmod/*'],
              message: 'apps/webhook-relay must stay standalone: no workspace packages.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]
