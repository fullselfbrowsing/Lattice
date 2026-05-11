import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "verify",
    description: "Verify a receipt's signature and structural integrity",
  },
  args: {
    receipt: {
      type: "positional",
      required: true,
      description: "Path to a receipt JSON file",
    },
  },
  run({ args }) {
    const message = `lattice verify: not-implemented (receipt=${args.receipt}); plan 11-02 wires the handler.`;
    process.stderr.write(message + "\n");
    process.exit(2);
  },
});
