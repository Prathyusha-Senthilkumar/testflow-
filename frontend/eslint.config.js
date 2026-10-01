// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([globalIgnores([
  '.next/**',
  'node_modules/**',
  'out/**',
  'dist/**',
  'coverage/**',
  'storybook-static/**',
  'next-env.d.ts',
]), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    globals: globals.browser,
  },
  rules: {
    // Next.js requires `metadata` beside the root layout component, and
    // navigation.tsx exports hooks next to link components. This rule comes
    // from the Vite fast-refresh preset and does not match that layout.
    "react-refresh/only-export-components": "off",
    // Pages and modals set loading or form state when a route id or `open`
    // changes. Moving that into a rewrite of every fetch effect would change
    // when loading and form resets run.
    "react-hooks/set-state-in-effect": "off",
  },
}, ...storybook.configs["flat/recommended"]])
