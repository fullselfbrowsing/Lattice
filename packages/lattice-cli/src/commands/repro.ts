import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "repro",
    description: "Replay a signed receipt and diff against recorded outputs",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "Receipt id (resolved against .lattice/receipts/) or path to a receipt JSON file",
    },
  },
  run({ args }) {
    const message = `lattice repro: not-implemented (target=${args.target}); plan 11-03 wires the handler.`;
    process.stderr.write(message + "\n");
    process.exit(2);
  },
});
