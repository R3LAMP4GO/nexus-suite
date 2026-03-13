import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
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
    ],
  },
];
