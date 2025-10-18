module.exports = {
  parser: "@typescript-eslint/parser",
  extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended", "prettier"],
  plugins: ["@typescript-eslint", "unused-imports"],
  rules: {
    // TEMP: turn these off or to "warn" until types are added
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-require-imports": "off",
  },
  overrides: [
    // .d.ts noise
    { files: ["**/*.d.ts"], rules: { "unused-imports/no-unused-imports": "off" } },
    // Do NOT run TS-specific rules on plain JS files (your importers/prisma are .js)
    { files: ["**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
    // If you want to be very targeted:
    { files: ["src/lib/importers/*.js", "src/lib/prisma.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  ],
};
