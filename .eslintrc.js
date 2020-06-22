module.exports = {
  extends: 'standard-with-typescript',
  parserOptions: {
    project: './tsconfig.json'
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      rules: {
        // https://github.com/typescript-eslint/typescript-eslint/blob/v3.2.0/packages/eslint-plugin/docs/rules/strict-boolean-expressions.md
        // 允许短路逻辑
        '@typescript-eslint/strict-boolean-expressions': 0
      }
    }
  ]
}
