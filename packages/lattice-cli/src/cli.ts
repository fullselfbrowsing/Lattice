#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

import { latticeCliVersion } from "./version.js";

const main = defineCommand({
  meta: {
    name: "lattice",
    version: latticeCliVersion,
    description:
      "Lattice CLI — replay, verify, eval, diff, and diagnose capability runs",
  },
  subCommands: {
    repro: () => import("./commands/repro.js").then((m) => m.default),
    verify: () => import("./commands/verify.js").then((m) => m.default),
    eval: () => import("./commands/eval.js").then((m) => m.default),
    receipt: () => import("./commands/receipt.js").then((m) => m.default),
    diagnostics: () =>
      import("./commands/diagnostics.js").then((m) => m.default),
  },
});

runMain(main);
