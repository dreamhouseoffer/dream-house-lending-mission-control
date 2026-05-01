const OVERNIGHT_LOAN_OFFICER_PLAYBOOK = `## Overnight Loan Officer Playbook
Category: Loan officer excellence
Audience: Fonz, Claudia, Nathaly, loan officer assistants
Source confidence: General industry best practices. Use Dream House Lending trainings and agency/lender guidelines above this.
Use when: The team asks how to be better loan officers, improve conversion, handle borrower/realtor communication, or build daily operating discipline.
Key takeaways:
- Speed to lead matters: respond fast, ask clean qualifying questions, and book the next concrete step.
- The best loan officer reduces uncertainty: clear timelines, clear document asks, no vague status updates.
- Follow-up wins when it is specific: what is needed, why it matters, who owns it, and by when.
- Realtors value proactive communication before problems become surprises.
- Borrowers need simple explanations, not mortgage jargon.
- Every file should have a next action, owner, deadline, and blocker status.
- A great LO protects trust: no guessing on guidelines, pricing, approvals, or compliance-sensitive claims.
- Daily discipline: new leads, active files, locks/closings, conditions, realtor touches, stuck files.
Training content:
A high-performing loan officer operates from a short daily loop: respond to new leads, qualify cleanly, set expectations, collect documents, update all active parties, remove blockers, and ask for referrals after wins. The bot should help the team turn vague work into next actions. It should draft scripts, summarize conditions, identify pipeline risks, and ask for missing facts before giving file-specific advice. It should not pretend to know guidelines that were not provided.`;

export function buildLoanTrainingContext(trainings = []) {
  const uploaded = Array.isArray(trainings) && trainings.length > 0
    ? trainings
        .filter(Boolean)
        .map((item, index) => formatTraining(item, index))
        .join("\n\n---\n\n")
    : "No pasted loan trainings have been provided in this chat yet.";

  return `${uploaded}\n\n---\n\n${OVERNIGHT_LOAN_OFFICER_PLAYBOOK}`;
}

export function parseTrainingPaste(raw = "") {
  const text = clean(raw);
  const fields = {
    title: extractField(text, ["TRAINING TITLE", "TITLE"]) || inferTitle(text),
    category: extractField(text, ["CATEGORY"]) || "General",
    audience: extractField(text, ["WHO IT'S FOR", "WHO ITS FOR", "AUDIENCE"]) || "Dream House Lending team",
    content: extractBlock(text, ["TRAINING CONTENT", "CONTENT"]) || text,
    useWhen: extractField(text, ["WHEN HERMES SHOULD USE THIS", "USE WHEN"]) || "Relevant to the team's loan/process question.",
  };
  return {
    ...fields,
    takeaways: splitTakeaways(extractBlock(text, ["KEY RULES / TAKEAWAYS", "KEY TAKEAWAYS", "TAKEAWAYS"])),
  };
}

export function createHermesSystemPrompt({ trainingContext = "", pipelineContext = "" } = {}) {
  return `You are Hermes inside Dream House Lending Mission Control, acting as a practical internal loan officer assistant for Fonz, Claudia, Nathaly, Daisy, Nelly, Manny, LOAs, processors, and the Dream House Lending team.

Your job:
- Answer loan-process, pipeline, borrower-follow-up, condition, and realtor-support questions clearly.
- Answer "how would Fonz handle this?" using Dream House Lending's uploaded trainings first.
- Help the team structure mortgage files from borrower goals, paystubs, W-2s, bank statements, soft-pull/liability data, Arive/MCM notes, and uploaded SOPs.
- Output internal structuring worksheets with assumptions, missing docs, red flags, likely paths, and human-review checkpoints.
- Use the overnight loan officer playbook for general excellence, scripts, daily discipline, and team coaching.
- Be concise, direct, operational, and action-oriented.
- Give draft scripts/messages when helpful, but mark them as drafts.
- Ask for missing facts when a loan-specific answer depends on borrower/file details.

Source hierarchy:
1. User-pasted Dream House Lending trainings and SOPs.
2. Current pipeline context.
3. Overnight loan officer playbook / general industry best practices.
4. If none cover it, say what is missing and ask for the source.

Rules:
- Do not invent guidelines, agency rules, overlays, rates, pricing, or legal/compliance requirements.
- Do not say a borrower is approved, denied, eligible, locked, clear-to-close, or guaranteed unless the source systems and human approval support it.
- If the training context does not cover the answer, say so and give a safe next step.
- Include source confidence when answering guideline/process questions: Uploaded training, Pipeline context, General playbook, or Missing source.
- Do not request or expose SSNs, bank account numbers, full DOBs, or passwords.
- For borrower-facing language, keep it professional, simple, and compliant.
- Anything sent externally must be approved by Fonz or the team first.

Pipeline context:
${pipelineContext || "No live pipeline context included for this request."}

Dream House Lending loan training context:
${trainingContext}`;
}

export function createFallbackAnswer(question = "", trainingContext = "") {
  return buildSourceAwareAnswer(question, trainingContext);
}

export function buildSourceAwareAnswer(question = "", trainingContext = "") {
  const query = clean(question).toLowerCase();
  const context = trainingContext || buildLoanTrainingContext([]);
  const sections = String(context)
    .split(/\n---\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const tokens = query
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4)
    .slice(0, 14);

  const scored = sections
    .map((section) => {
      const lower = section.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
      return { section, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored.find((item) => item.score > 0)?.section || sections[sections.length - 1] || "";
  const title = best.match(/^##\s+(.+)$/m)?.[1] || "the available knowledge base";
  const confidence = best.includes("Source confidence:")
    ? best.match(/Source confidence:\s*(.+)/)?.[1] || "General playbook"
    : title === "Overnight Loan Officer Playbook"
      ? "General playbook"
      : "Uploaded training";
  const excerpt = best
    ? selectRelevantExcerpt(best.replace(/^##\s+/gm, ""), tokens)
    : "No training has been pasted into this chat yet.";

  return {
    mode: "fallback",
    answer: best
      ? `I found the closest match in **${title}**.\n\nSource confidence: ${confidence}\n\n${excerpt}\n\nTreat this as an internal assistant summary. For agency/lender guideline decisions, verify against the actual guideline or uploaded DHL training.`
      : "I don’t have uploaded training content for that yet. Paste the training or ask Fonz to approve the source, then I can turn it into a reusable SOP.",
    nextActions: [
      "Confirm the exact loan program and scenario before applying this to a live file.",
      "If this is borrower-facing, have Fonz/team approve the message before sending.",
      "Paste the related training if you want Hermes to answer this more precisely next time.",
    ],
  };
}

function formatTraining(item, index) {
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
    `Source confidence: Uploaded training`,
    useWhen ? `Use when: ${useWhen}` : "Use when: Relevant to the team's loan/process question.",
    takeaways.length ? `Key takeaways:\n${takeaways.map((t) => `- ${t}`).join("\n")}` : null,
    content ? `Training content:\n${content}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function extractField(text, labels) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${escapeRegExp(label)}\\s*:\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractBlock(text, labels) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const nextLabels = "TRAINING TITLE|TITLE|CATEGORY|WHO IT'S FOR|WHO ITS FOR|AUDIENCE|TRAINING CONTENT|CONTENT|KEY RULES \/ TAKEAWAYS|KEY TAKEAWAYS|TAKEAWAYS|WHEN HERMES SHOULD USE THIS|USE WHEN";
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*:\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels})\\s*:|$)`, "i"));
  return match?.[1]?.trim() || "";
}

function inferTitle(text) {
  return text.split("\n").find((line) => line.trim().length > 0)?.slice(0, 80) || "Pasted training";
}

function selectRelevantExcerpt(section, tokens = []) {
  const lines = String(section).split("\n").filter((line) => line.trim().length > 0);
  const searchableTokens = tokens.filter((token) => !["training", "transcript", "loom", "about", "what", "where", "when", "from"].includes(token));
  const relevantIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return searchableTokens.some((token) => lower.includes(token));
  });

  if (relevantIndex === -1 || relevantIndex < 8) {
    return lines.slice(0, 10).join("\n");
  }

  const header = lines.slice(0, 5);
  const start = Math.max(5, relevantIndex - 2);
  const end = Math.min(lines.length, relevantIndex + 3);
  const relevant = lines.slice(start, end);
  return [...header, "…", ...relevant].join("\n");
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function splitTakeaways(value) {
  return clean(value)
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
