const nextEslintConfig = require('eslint-config-next')

module.exports = [
  ...nextEslintConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['node_modules/**', '.next/**', 'out/**', 'docs/**', 'hardware/**'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_+', varsIgnorePattern: '^_+' }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/use-memo': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_+', varsIgnorePattern: '^_+' }],
    },
  },
]
