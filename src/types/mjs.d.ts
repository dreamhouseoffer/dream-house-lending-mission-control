declare module "*.mjs" {
  export function buildLoanTrainingContext(trainings?: unknown[]): string;
  export function parseTrainingPaste(raw?: string): {
    title: string;
    category: string;
    audience: string;
    content: string;
    takeaways: string[];
    useWhen: string;
  };
  export function createHermesSystemPrompt(input?: { trainingContext?: string; pipelineContext?: string }): string;
  export function createFallbackAnswer(question?: string, trainingContext?: string): {
    mode: string;
    answer: string;
    nextActions: string[];
  };
  export function buildSourceAwareAnswer(question?: string, trainingContext?: string): {
    mode: string;
    answer: string;
    nextActions: string[];
  };
}
