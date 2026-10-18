import nextCore from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCore,
  {
    rules: {
      // Query rows are untyped SQL results; CSV exports are plain downloads.
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
