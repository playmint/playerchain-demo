/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config} config
 */
const config = {
    arrowParens: 'always',
    singleQuote: true,
    insertPragma: false,
    tabWidth: 4,
    useTabs: false,
    printWidth: 80,
    trailingComma: 'all',
    semi: true,
    importOrder: ['^[./]'],
    importOrderSeparation: false,
    importOrderSortSpecifiers: true,
    plugins: ['@trivago/prettier-plugin-sort-imports'],
};

export default config;
