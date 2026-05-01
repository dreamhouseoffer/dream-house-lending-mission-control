"use client";

import { useMemo, useState } from "react";
import { Bot, Copy, Loader2, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Training = {
  title: string;
  category: string;
  audience: string;
  content: string;
  takeaways: string;
  useWhen: string;
};

const STORAGE_KEY = "dhl_ask_hermes_trainings_v1";

const starters = [
  "What files need attention today?",
  "Draft a borrower follow-up for missing conditions.",
  "What should Claudia/Nathaly use this training for?",
  "Turn this training into an SOP.",
];

function loadTrainings(): Training[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTrainings(trainings: Training[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trainings));
}

export function AskHermesChat({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I’m Hermes for Dream House Lending. Ask about pipeline, loan process, conditions, scripts, or paste a training and I’ll turn it into usable team knowledge.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>(loadTrainings);
  const [trainingDraft, setTrainingDraft] = useState<Training>({
    title: "",
    category: "Process",
    audience: "Loan officer / processor",
    content: "",
    takeaways: "",
    useWhen: "",
  });

  const trainingPayload = useMemo(
    () =>
      trainings.map((training) => ({
        ...training,
        takeaways: training.takeaways
          .split("\n")
          .map((line) => line.replace(/^[-*•\s]+/, "").trim())
          .filter(Boolean),
      })),
    [trainings]
  );

  async function sendQuestion(questionOverride?: string) {
    const question = (questionOverride ?? input).trim();
    if (!question || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ask-hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          trainings: trainingPayload,
          history: messages.slice(-8),
        }),
      });
      const data = await response.json();
      const answer = response.ok ? data.answer : data.error || "Hermes failed to answer.";
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMessages([...nextMessages, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function addTraining() {
    if (!trainingDraft.content.trim()) return;
    const next = [
      ...trainings,
      {
        ...trainingDraft,
        title: trainingDraft.title.trim() || `Training ${trainings.length + 1}`,
      },
    ];
    setTrainings(next);
    saveTrainings(next);
    setTrainingDraft({
      title: "",
      category: "Process",
      audience: "Loan officer / processor",
      content: "",
      takeaways: "",
      useWhen: "",
    });
  }

  function clearTrainings() {
    setTrainings([]);
    saveTrainings([]);
  }

  function copyEmbed() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://dream-house-lending-mission-control.vercel.app";
    const snippet = `<iframe src="${origin}/embed/hermes" style="width:100%;height:720px;border:0;border-radius:18px;background:#090909;" title="Ask Hermes"></iframe>`;
    navigator.clipboard?.writeText(snippet);
  }

  return (
    <div className={embedded ? "min-h-screen bg-[#080808] p-3" : "p-4 md:p-8"}>
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] shadow-2xl shadow-black/30">
          <div className="border-b border-white/[0.06] bg-black/20 p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
                  <Bot size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/60">Ask Hermes</p>
                  <h1 className="truncate text-xl font-black text-white">Loan team chatbot</h1>
                </div>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-bold text-white/45 sm:flex">
                <ShieldCheck size={14} /> Private ops use
              </div>
            </div>
          </div>

          <div className="h-[520px] space-y-3 overflow-y-auto p-4 md:p-5">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[86%] rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-black"
                      : "max-w-[90%] whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 text-sm leading-6 text-white/82"
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 text-sm text-white/55">
                  <Loader2 className="animate-spin" size={15} /> Hermes is thinking…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] p-4 md:p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button
                  key={starter}
                  onClick={() => sendQuestion(starter)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-white/50 transition hover:border-emerald-400/20 hover:text-emerald-200"
                >
                  {starter}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendQuestion();
                  }
                }}
                placeholder="Ask about loans, conditions, borrower follow-up, pipeline, or pasted trainings…"
                className="min-h-[54px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/35"
              />
              <button
                onClick={() => sendQuestion()}
                disabled={loading || !input.trim()}
                className="flex w-14 items-center justify-center rounded-2xl bg-emerald-400 text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30">training inbox</p>
                <h2 className="mt-1 font-black text-white">Paste loan training</h2>
              </div>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-xs font-bold text-white/38">{trainings.length} saved</span>
            </div>

            <div className="space-y-2">
              <input
                value={trainingDraft.title}
                onChange={(e) => setTrainingDraft({ ...trainingDraft, title: e.target.value })}
                placeholder="Training title"
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
              />
              <input
                value={trainingDraft.category}
                onChange={(e) => setTrainingDraft({ ...trainingDraft, category: e.target.value })}
                placeholder="Category: FHA, VA, Scripts, Process…"
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
              />
              <textarea
                value={trainingDraft.content}
                onChange={(e) => setTrainingDraft({ ...trainingDraft, content: e.target.value })}
                placeholder="Paste the training here…"
                className="min-h-[160px] w-full resize-y rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
              />
              <textarea
                value={trainingDraft.takeaways}
                onChange={(e) => setTrainingDraft({ ...trainingDraft, takeaways: e.target.value })}
                placeholder="Key takeaways — one per line"
                className="min-h-[76px] w-full resize-y rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
              />
              <input
                value={trainingDraft.useWhen}
                onChange={(e) => setTrainingDraft({ ...trainingDraft, useWhen: e.target.value })}
                placeholder="Use when…"
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={addTraining} className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-black text-black hover:bg-emerald-200">
                Save training
              </button>
              <button onClick={clearTrainings} className="rounded-xl border border-white/[0.08] px-3 py-2 text-white/45 hover:text-white" title="Clear saved trainings">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 text-emerald-300" size={18} />
              <div>
                <h2 className="font-black text-white">ORAI embed</h2>
                <p className="mt-1 text-sm leading-6 text-white/45">
                  Use the iframe page for ORAI once we know where custom widgets/iframes go. This is PIN-protected by Mission Control.
                </p>
              </div>
            </div>
            <button onClick={copyEmbed} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-200 hover:bg-emerald-500/15">
              <Copy size={15} /> Copy embed snippet
            </button>
            <code className="mt-3 block rounded-xl bg-black/35 p-3 text-xs leading-5 text-white/35">/embed/hermes</code>
          </div>
        </aside>
      </div>
    </div>
  );
}
