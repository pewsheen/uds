import tseslint from 'typescript-eslint'

const BANNED_IN_CORE = [
  { name: 'document', message: 'core must be pure: no DOM' },
  { name: 'window', message: 'core must be pure: no window' },
  { name: 'fetch', message: 'core must be pure: no fetch' },
  { name: 'chrome', message: 'core must be pure: no chrome API' },
  { name: 'requestAnimationFrame', message: 'core must be pure: no rAF' },
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...BANNED_IN_CORE],
      'no-restricted-imports': ['error', { patterns: ['**/adapters/*', '**/adapters/**'] }],
    },
  },
)
