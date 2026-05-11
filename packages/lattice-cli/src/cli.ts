#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

import { latticeCliVersion } from "./version.js";

const main = defineCommand({
  meta: {
    name: "lattice",
    version: latticeCliVersion,
    description: "Lattice CLI — repro and verify signed capability receipts",
  },
  subCommands: {
    repro: () => import("./commands/repro.js").then((m) => m.default),
    verify: () => import("./commands/verify.js").then((m) => m.default),
  },
});

runMain(main);
