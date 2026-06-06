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
    // Inline the workspace runtime so vite-node loads it via the workspace
    // symlink rather than treating it as an external dep. Without this,
    // vite-node's external resolver hits "Failed to resolve entry" for
    // workspace packages on cold CI runners, even though Node's own ESM
    // resolver matches the import condition fine. See PR #2 CI debug.
    server: {
      deps: {
        inline: [/^@full-self-browsing\//]
      }
    },
    typecheck: {
      ignoreSourceErrors: true,
      include: ["test/**/*.test.ts"],
      tsconfig: "./tsconfig.json"
    }
  }
});
