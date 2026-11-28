import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import exemptions from './lint-exemptions.json' with { type: 'json' };
import { LAYER_RULE, SIZE_RULES, overrides } from './tools/lintExemptions.js';

const SCHEMAS = ['(^|/)DB/Schemas/', 'Only Utils/DBUtils reads the schemas.'];
const MONGOOSE = ['^mongoose$', 'Only the data layer talks to MongoDB.'];
const DISCORD = ['^discord\\.js$', 'Only the Discord layer uses discord.js.'];
const EXPRESS = ['^express$', 'Only the API uses Express.'];
const DATA_LAYER = ['(^|/)DBUtils/', 'Discord and the API go through Services, not the data layer.'];

const layer = (files, banned) => ({
    files,
    rules: { [LAYER_RULE]: ['error', { patterns: banned.map(([regex, message]) => ({ regex, message })) }] },
});

export default tseslint.config(
    {
        ignores: ['node_modules/', 'dist/', 'coverage/', 'reports/', '.stryker-tmp/', 'config.js', 'configProd.js'],
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
        files: ['Discord/bot.ts'],
        rules: { '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }] },
    },
    {
        files: ['DB/Schemas/*.ts'],
        rules: { '@typescript-eslint/no-unsafe-class-instance-assignment': 'off' },
    },
    {
        rules: Object.fromEntries(Object.entries(SIZE_RULES).map(([rule, max]) => [rule, ['error', { max }]])),
    },
    {
        files: ['tests/**'],
        rules: { 'max-lines-per-function': 'off' },
    },
    layer(['Services/**', 'Utils/domain/**', 'Utils/permissions.ts'], [SCHEMAS, MONGOOSE, DISCORD, EXPRESS]),
    layer(['bot.js', 'Discord/**'], [SCHEMAS, MONGOOSE, EXPRESS, DATA_LAYER]),
    {
        files: ['Discord/commands/**', 'Discord/components/**', 'Discord/notifier.ts', 'Discord/router.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...['Literal[value=/[^!-~]/]', 'TemplateElement[value.raw=/[^!-~]/]'].map((text) => ({
                    selector: `${text}:not(CallExpression[callee.object.name='console'] *)`,
                    message: 'Wording members see lives in Discord/views; only ids and log lines belong here.',
                })),
            ],
        },
    },
    layer(['API/**'], [SCHEMAS, MONGOOSE, DISCORD, DATA_LAYER]),
    layer(['DB/**', 'Utils/DBUtils/**', 'Utils/Backup/**', 'scripts/**', 'tools/**'], [DISCORD, EXPRESS]),
    ...(process.env['LINT_EXEMPTIONS'] === 'ignore' ? [] : overrides(exemptions)),
);
