// ESLint config — the thing `npm run lint` was pretending to be.
//
// `"lint": "tsc --noEmit"` is a TYPE-CHECK, not a linter, and there was no ESLint config in the
// project at all. So the command passed cleanly while nothing checked for unused variables,
// accidental `any`, or — the one that actually bites — missing useEffect dependencies. A green
// lint gave a confidence it hadn't earned.
//
// `react-hooks/exhaustive-deps` is the rule worth having here. Stale-closure bugs (an effect
// capturing an old piece of state and silently acting on it) are the hardest class of React bug
// to reproduce by hand, and this catches them statically.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'functions/lib', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Warnings, not errors, on purpose. This is a large existing codebase — turning these to
      // errors on day one would produce hundreds of failures, and a lint everyone bypasses with
      // --no-verify protects nothing. Fix them as you touch each file, then tighten.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Empty catch blocks are a deliberate pattern here (storage blocked in private mode,
      // best-effort cleanup), so allow them and keep the rule for genuinely empty bodies.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
