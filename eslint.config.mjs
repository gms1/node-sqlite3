import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/', 'build/', 'prebuilds/', 'deps/'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'indent': ['error', 4],
            'linebreak-style': ['error', 'unix'],
            'semi': ['error', 'always'],
            'no-cond-assign': ['error', 'always'],
            'no-inner-declarations': 'off',
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
    {
        files: ['tools/**/*.js'],
        rules: {
            'no-unused-vars': 'off',
        },
    },
];
