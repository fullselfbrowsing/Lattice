import { expectAssignable, expectError, expectType } from "tsd";
import {
  PROMPT_STRATEGIES,
  getStructuredOutputContract,
  getToolUseContract,
} from "@full-self-browsing/lattice";
import type { RecommendedPromptStrategy } from "@full-self-browsing/lattice";

declare const strategy: RecommendedPromptStrategy;

expectType<string>(getStructuredOutputContract(strategy, { type: "object" }));
expectType<string>(getToolUseContract(strategy, []));
expectAssignable<readonly RecommendedPromptStrategy[]>(PROMPT_STRATEGIES);

expectError(getStructuredOutputContract("frontier_rlhf", {}));
expectError(getToolUseContract("not-a-strategy", []));
