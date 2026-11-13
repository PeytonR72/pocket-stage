import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  {ignores:['dist/**','node_modules/**','proof/**','qa/**','demo/**','public/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {files:['**/*.{ts,tsx,js,mjs}'],languageOptions:{globals:{...globals.browser,...globals.node}},rules:{'no-empty':['error',{allowEmptyCatch:true}]}},
  {files:['tests/**/*'],rules:{'@typescript-eslint/no-explicit-any':'off'}},
);
