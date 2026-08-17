import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Flat config bridged through FlatCompat, which is the shape eslint-config-next
 * ships for Next 15. The Next 16 scaffold's bare `eslint-config-next/...`
 * subpath imports do not resolve against this version.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "work/**"],
  },
];

export default eslintConfig;
