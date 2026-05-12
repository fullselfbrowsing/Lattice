import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test-d/**"],
    environment: "node",
    // The showcase-e2e test spawns child processes (pnpm build + node showcase
    // + several separate CLI invocations) and the default 5s timeout is too
    // tight. Other tests in this package complete in <1s; this raised ceiling
    // only affects the e2e test which still runs in well under 120s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    typecheck: {
      ignoreSourceErrors: true,
      include: ["test/**/*.test.ts"],
      tsconfig: "./tsconfig.json"
    }
  }
});
