import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import process from 'node:process';
import tseslint from 'typescript-eslint';

const isFixMode = process.argv.some((arg) => arg.startsWith('--fix'));

export default tseslint.config(
    { files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'] },
    {
        settings: {
            react: {
                version: 'detect',
            },
        },
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                project: true,
                tsconfigRootDir: '.',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
    },
    {
        ignores: [
            'src/renderer/three.js',
            'src/index.d.ts',
            'build/',
            'dist/',
            'node_modules/',
            '.husky/',
        ],
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    react.configs.flat.recommended,
    {
        plugins: {
            'react-hooks': hooksPlugin,
        },
        rules: hooksPlugin.configs.recommended.rules,
    },
    eslintConfigPrettier,
    {
        rules: {
            'no-unreachable': isFixMode ? 'off' : 'warn',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            'react/jsx-uses-react': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/no-unknown-property': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            curly: 'warn',
        },
    },
    {
        ignores: ['index.d.ts'],
    },
);
