import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test-d/**"],
    environment: "node",
    typecheck: {
      ignoreSourceErrors: true,
      include: ["test/**/*.test.ts"],
      tsconfig: "./tsconfig.json"
    }
  }
});
