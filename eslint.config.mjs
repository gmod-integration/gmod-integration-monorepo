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
      '**/logs/**',
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
