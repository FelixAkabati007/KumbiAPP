import eslintConfigNext from "eslint-config-next";

export default [
  { ignores: ["node_modules", ".next", "coverage", "supabase/", "functions/", "apps/**/node_modules"] },
  ...eslintConfigNext,
  {
    files: ["scripts/**/*.js", "*.config.js", "*.config.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
