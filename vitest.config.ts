import { defineConfig } from "vitest/config";

function loadTsconfigPaths() {
  try {
    // Lazy-load to avoid build/type errors if the plugin isn't installed
    // Using require here is fine in config files
    // eslint-disable-next-line no-undef
    const mod = require("vite-tsconfig-paths");
    const plugin = (mod as any)?.default ?? mod;
    return typeof plugin === "function" ? plugin() : undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig({
  plugins: [loadTsconfigPaths()].filter(Boolean) as any,
  test: {
    environment: "node",
    globals: true,
  },
});
