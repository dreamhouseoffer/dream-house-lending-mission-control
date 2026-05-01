declare module "*.mjs" {
  export function buildLoanTrainingContext(trainings?: unknown[]): string;
  export function createHermesSystemPrompt(input?: { trainingContext?: string; pipelineContext?: string }): string;
  export function createFallbackAnswer(question?: string, trainingContext?: string): {
    mode: string;
    answer: string;
    nextActions: string[];
  };
}
