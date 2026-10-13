const js = require('@eslint/js');
const globals = require('globals');
module.exports = [{ignores:['node_modules/**','dist/**','test-results/**','codigo/**']},{files:['server/**/*.cjs','scripts/**/*.cjs','servidor.cjs'],...js.configs.recommended,languageOptions:{sourceType:'commonjs',globals:globals.node},rules:{...js.configs.recommended.rules,'no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}],'no-eval':'error','no-implied-eval':'error','no-new-func':'error'}}];
