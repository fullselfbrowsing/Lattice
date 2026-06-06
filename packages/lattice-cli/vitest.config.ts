import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// PR #2 CI debug: vite-node's resolver cannot follow the @full-self-browsing
// scoped workspace package's exports map on cold runners even though Node's
// own resolver handles it fine. Aliasing the workspace runtime directly to
// its built ESM entry sidesteps vite's resolver. The dist file is built
// before tests run by the workspace-level pnpm -r build step in ci.yml and
// by lattice-cli's own `pnpm build` prefix in the test script.
const latticeRuntimeUrl = new URL("../lattice/dist/index.js", import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      "@full-self-browsing/lattice": fileURLToPath(latticeRuntimeUrl),
    },
  },
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
