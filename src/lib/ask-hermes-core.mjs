export function buildLoanTrainingContext(trainings = []) {
  if (!Array.isArray(trainings) || trainings.length === 0) {
    return "No pasted loan trainings have been provided in this chat yet.";
  }

  return trainings
    .filter(Boolean)
    .map((item, index) => {
      const title = clean(item.title) || `Training ${index + 1}`;
      const category = clean(item.category) || "General";
      const audience = clean(item.audience) || "Dream House Lending team";
      const content = clean(item.content);
      const useWhen = clean(item.useWhen);
      const takeaways = Array.isArray(item.takeaways)
        ? item.takeaways.map(clean).filter(Boolean)
        : splitTakeaways(item.takeaways);

      return [
        `## ${title}`,
        `Category: ${category}`,
        `Audience: ${audience}`,
        useWhen ? `Use when: ${useWhen}` : "Use when: Relevant to the team's loan/process question.",
        takeaways.length ? `Key takeaways:\n${takeaways.map((t) => `- ${t}`).join("\n")}` : null,
        content ? `Training content:\n${content}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

export function createHermesSystemPrompt({ trainingContext = "", pipelineContext = "" } = {}) {
  return `You are Hermes inside Dream House Lending Mission Control, acting as a practical loan officer assistant for Fonz, Claudia, and Nathaly.

Your job:
- Answer loan-process, pipeline, borrower-follow-up, condition, and realtor-support questions clearly.
- Use Dream House Lending's uploaded trainings first.
- Be concise, direct, operational, and action-oriented.
- Give draft scripts/messages when helpful, but mark them as drafts.
- Ask for missing facts when a loan-specific answer depends on borrower/file details.

Rules:
- Do not invent guidelines, agency rules, overlays, rates, pricing, or legal/compliance requirements.
- If the training context does not cover the answer, say so and give a safe next step.
- Do not request or expose SSNs, bank account numbers, full DOBs, or passwords.
- For borrower-facing language, keep it professional, simple, and compliant.
- Anything sent externally must be approved by Fonz or the team first.

Pipeline context:
${pipelineContext || "No live pipeline context included for this request."}

Dream House Lending loan training context:
${trainingContext}`;
}

export function createFallbackAnswer(question = "", trainingContext = "") {
  const query = clean(question).toLowerCase();
  const sections = String(trainingContext || "")
    .split(/\n---\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const tokens = query
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4)
    .slice(0, 12);

  const scored = sections
    .map((section) => {
      const lower = section.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
      return { section, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored.find((item) => item.score > 0)?.section || sections[0] || "";
  const title = best.match(/^##\s+(.+)$/m)?.[1] || "the uploaded trainings";
  const excerpt = best
    ? best.replace(/^##\s+/gm, "").split("\n").filter(Boolean).slice(0, 8).join("\n")
    : "No training has been pasted into this chat yet.";

  return {
    mode: "fallback",
    answer: best
      ? `I found the closest match in **${title}**.\n\n${excerpt}\n\nI’m in fallback mode, so treat this as a training lookup summary — not a final guideline ruling.`
      : "I don’t have uploaded training content for that yet. Paste the training or ask Fonz to approve the source, then I can turn it into a reusable SOP.",
    nextActions: [
      "Confirm the exact loan program and scenario before applying this to a live file.",
      "If this is borrower-facing, have Fonz/team approve the message before sending.",
      "Paste the related training if you want Hermes to answer this more precisely next time.",
    ],
  };
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function splitTakeaways(value) {
  return clean(value)
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}
