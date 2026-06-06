import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  treeshake: true,
  // Bundle the workspace runtime into the CLI tarball so it ships standalone.
  // Without this, the CLI's compiled chunks emit `import "@full-self-browsing/lattice"`
  // and rely on Node ESM resolution of the workspace symlink at runtime, which
  // is fragile on cold Linux/Node 24 hosts where the symlink path is not
  // realpath'd before the exports map is composed. Bundling produces a tarball
  // with no runtime dependency on the scoped runtime package.
  noExternal: [/^@full-self-browsing\//]
});
