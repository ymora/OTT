const nextEslintConfig = require('eslint-config-next')

const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin')
const typescriptEslintParser = require('@typescript-eslint/parser')

module.exports = [
  ...nextEslintConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['node_modules/**', '.next/**', 'out/**', 'docs/**', 'hardware/**'],
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin
    },
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module',
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_+', varsIgnorePattern: '^_+' }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/use-memo': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_+', varsIgnorePattern: '^_+' }],
    },
  },
]
