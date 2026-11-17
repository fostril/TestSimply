export type RunnerStatus = "PASS" | "FAIL" | "BLOCKED";
export type StepStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

export type StepResultState = {
  stepIndex: number;
  status: StepStatus;
  actual: string;
  comments: string;
};

/**
 * Collapse per-step statuses into an overall result using Xray precedence:
 * FAIL > BLOCKED > PASS (when all steps pass). Returns null when inconclusive.
 */
export function deriveOverallStatus(steps: StepResultState[]): RunnerStatus | null {
  if (steps.length === 0) return null;
  if (steps.some((s) => s.status === "FAIL")) return "FAIL";
  if (steps.some((s) => s.status === "BLOCKED")) return "BLOCKED";
  if (steps.every((s) => s.status === "PASS")) return "PASS";
  return null;
}
