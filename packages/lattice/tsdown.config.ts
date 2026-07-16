import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/providers.ts",
    "src/audit.ts",
    "src/context.ts",
    "src/artifacts.ts",
    "src/routing.ts",
    "src/tools.ts",
    "src/storage.ts",
    "src/eval.ts",
    "src/agents.ts",
    "src/core.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  treeshake: true,
});
