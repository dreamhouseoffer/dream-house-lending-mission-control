import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  buildLoanTrainingContext,
  createFallbackAnswer,
  createHermesSystemPrompt,
  parseTrainingPaste,
} from "@/lib/ask-hermes-core.mjs";
import { getPipelineData } from "@/lib/airtable-pipeline";

export const dynamic = "force-dynamic";

type TrainingInput = {
  title?: string;
  category?: string;
  audience?: string;
  content?: string;
  takeaways?: string[] | string;
  useWhen?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function cleanText(value: unknown, max = 12000) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function loadServerTrainings(): TrainingInput[] {
  const dir = join(process.cwd(), "content", "loan-training");
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") || name.endsWith(".txt"))
    .sort()
    .slice(0, 50)
    .map((name) => {
      const raw = readFileSync(join(dir, name), "utf-8");
      return parseTrainingPaste(raw) as TrainingInput;
    });
}

async function getSafePipelineContext() {
  try {
    const data = await getPipelineData();
    return [
      `Source: ${data.source}`,
      `Connected: ${data.connected}`,
      `Total records: ${data.stats.totalLoans}`,
      `Active loans: ${data.stats.activeLoans}`,
      `Active volume: ${data.stats.activeVolume}`,
      `Closing this month: ${data.stats.closingThisMonth}`,
      `Locks expiring soon: ${data.stats.locksExpiringSoon}`,
      `Stale files: ${data.stats.staleFiles}`,
    ].join("\n");
  } catch {
    return "Pipeline context unavailable.";
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = cleanText(body.question, 4000);
    const userTrainings = Array.isArray(body.trainings) ? (body.trainings as TrainingInput[]).slice(0, 20) : [];
    const trainings = [...loadServerTrainings(), ...userTrainings];
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]).slice(-8) : [];

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const trainingContext = buildLoanTrainingContext(trainings);
    const pipelineContext = await getSafePipelineContext();
    const system = createHermesSystemPrompt({ trainingContext, pipelineContext });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(createFallbackAnswer(question, trainingContext));
    }

    const client = new Anthropic({ apiKey });
    const messages = [
      ...history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && cleanText(m.content, 2000))
        .map((m) => ({ role: m.role, content: cleanText(m.content, 2000) })),
      { role: "user" as const, content: question },
    ];

    const message = await client.messages.create({
      model: process.env.ASK_HERMES_MODEL || "claude-sonnet-4-6-20250514",
      max_tokens: 900,
      system,
      messages,
    });

    const answer = message.content[0]?.type === "text" ? message.content[0].text : "I couldn’t produce an answer.";

    return NextResponse.json({
      mode: "ai",
      answer,
      nextActions: [
        "Use the answer internally unless the team approves borrower/realtor-facing language.",
        "Paste the related training if this needs to become a permanent SOP.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
