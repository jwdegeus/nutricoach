import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';
import tailwindV4 from 'eslint-plugin-tailwind-v4';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Tailwind v4: plugin disabled — has 400+ false positives with Tailwind v4 @theme
  // (truncate, min-h-dvh, data-*, etc.). Re-enable when eslint-plugin-tailwind-v4
  // improves v4 support.
  {
    plugins: { 'tailwind-v4': tailwindV4 },
    rules: {
      'tailwind-v4/no-undefined-classes': 'off',
    },
  },
  // Downgrade or disable rules that would require many edits; fix over time.
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
  // Disable ESLint rules that conflict with Prettier (must be last).
  eslintConfigPrettier,
]);

export default eslintConfig;
