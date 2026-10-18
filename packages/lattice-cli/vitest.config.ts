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
    // Run test files one at a time. showcase-e2e.test.ts and
    // v14-validation.test.ts each rebuild packages/lattice/dist in beforeAll,
    // and tsdown's `clean: true` deletes the directory before rewriting it.
    // With parallel files, one file's clean step can remove dist/index.js
    // while the other is spawning the showcase or the CLI binary, which
    // fails with ERR_MODULE_NOT_FOUND even though both builds exit 0. The
    // suite is small, so sequential execution costs little.
    fileParallelism: false,
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
