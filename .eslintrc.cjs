module.exports = {
  root: true,
  plugins: ["unused-imports"],
  extends: ["next", "next/core-web-vitals", "prettier"],
  rules: {
    "unused-imports/no-unused-imports": "error"
  }
};
