import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['node_modules/', 'dist/', 'coverage/', 'config.js', 'configProd.js'],
    },
    js.configs.recommended,
    tseslint.configs.strict,
    security.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: globals.node,
        },
        rules: {
            'security/detect-object-injection': 'off',
            'security/detect-non-literal-fs-filename': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: { ...globals.browser, Chart: 'readonly', TomSelect: 'readonly', html2canvas: 'readonly' },
        },
    },
    {
        files: ['tests/**/*.js'],
        rules: {
            'security/detect-non-literal-regexp': 'off',
        },
    },
    {
        files: ['**/*.ts'],
        extends: [tseslint.configs.strictTypeChecked],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
    },
    {
        files: ['DB/Schemas/*.ts'],
        rules: { '@typescript-eslint/no-unsafe-class-instance-assignment': 'off' },
    },
);
