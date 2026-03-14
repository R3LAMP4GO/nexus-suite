import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    rules: {
      "prefer-const": "warn",
    },
  },
  {
    ignores: [
      "src/generated/**",
      ".next/**",
      "node_modules/**",
      "services/**",
      "scripts/**",
      "prisma/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
];
