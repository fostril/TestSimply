import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const resolvePath = (relativePath: string) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath);

export default defineConfig({
  resolve: {
    alias: {
      "@": resolvePath("src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**/*"],
  },
});
