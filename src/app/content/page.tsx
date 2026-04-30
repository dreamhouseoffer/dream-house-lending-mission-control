import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Clapperboard,
  HeartPulse,
  PlayCircle,
  Sparkles,
  Target,
} from "lucide-react";

const videos = [
  {
    title: "The Buyer Freeze",
    audience: "First-time buyers / renters",
    emotion: "Relief after confusion",
    hook: "If buying a house feels impossible right now, pause — you may be looking at the wrong number.",
    script: [
      "Most buyers start with the home price. That is backwards.",
      "The real question is: what monthly payment actually fits your life without making you house poor?",
      "Once we know that number, we can work backwards into price, loan type, seller credit, and strategy.",
      "Do not self-decline because Zillow scared you. Get the real math first.",
      "DM me the word PAYMENT and I will help you map the numbers before you fall in love with the wrong house.",
    ],
    visual: "Fonz on camera, calm/direct. Overlay: PRICE is noise → PAYMENT is strategy.",
    cta: "DM PAYMENT",
  },
  {
    title: "Realtor Deal Saver",
    audience: "Realtor partners",
    emotion: "Urgency + confidence",
    hook: "Realtors: before your buyer walks away over payment, check this first.",
    script: [
      "A deal does not die just because the first payment estimate looks high.",
      "There may be room through seller credits, temporary buydowns, lender credits, program fit, or restructuring the offer.",
      "The worst move is letting the buyer emotionally quit before the financing strategy is reviewed.",
      "Send me the scenario. I will tell you quickly if there is a path or if it is truly dead.",
      "Your job is to keep the client calm. My job is to find the financing angle.",
    ],
    visual: "Split screen: Realtor panic → financing options checklist → calm buyer.",
    cta: "Text me the scenario",
  },
  {
    title: "Pre-Approval Is Not Pre-Qualified",
    audience: "Serious buyers",
    emotion: "Protection / trust",
    hook: "A weak pre-approval can cost you the house — or worse, embarrass you in escrow.",
    script: [
      "A real pre-approval is not just a quick phone call and a pretty letter.",
      "We need income, assets, credit, debts, and the details that underwriting actually cares about.",
      "That work protects you. It protects your agent. And it makes your offer stronger when the right house shows up.",
      "If you want to buy this year, do the boring math early. That is how you move with confidence later.",
      "DM me READY and I will show you what a real pre-approval should include.",
    ],
    visual: "Document stack + underwriting checklist + buyer getting keys.",
    cta: "DM READY",
  },
];

const workflow = [
  "Pick one audience: buyer, Realtor, past client, or investor.",
  "Choose the emotional shift: confused → clear, scared → protected, stuck → action.",
  "Record 35-45 seconds in Fonz voice. No fluff. One point only.",
  "Use captions, B-roll, and one CTA. Post everywhere, then track replies.",
];

export default function ContentPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.20),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018))] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-purple-200">
                <Clapperboard className="size-3.5" /> Video Studio / Emotion Engine
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                Create mortgage videos that move people to action.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/52 sm:text-base">
                This is not a content toy. It is a lead engine: hook emotion, teach one thing, ask for one reply, track whether it creates conversations.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-3 gap-2 rounded-3xl border border-white/[0.08] bg-black/25 p-3">
              {[
                ["3", "Ready scripts"],
                ["45s", "Max length"],
                ["1", "CTA each"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-center">
                  <p className="text-2xl font-black text-white">{value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-white/32">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.045] p-5">
            <div className="mb-4 flex items-center gap-2 text-emerald-300">
              <HeartPulse className="size-5" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Emotion Formula</h2>
            </div>
            <div className="space-y-3">
              {[
                ["Fear", "I do not know if I can buy."],
                ["Clarity", "Here is the real number to look at."],
                ["Confidence", "There is a path if we structure it right."],
                ["Action", "DM one keyword so the conversation starts."],
              ].map(([label, text]) => (
                <div key={label} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-sm font-bold text-white/82">{label}</p>
                    <p className="text-xs leading-5 text-white/45">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="mb-4 flex items-center gap-2 text-white/70">
              <Target className="size-5 text-amber-300" />
              <h2 className="text-sm font-black uppercase tracking-[0.18em]">Production Rules</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map((item, index) => (
                <div key={item} className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/25">Step {index + 1}</p>
                  <p className="text-sm leading-6 text-white/68">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {videos.map((video, index) => (
            <article key={video.title} className="flex flex-col rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-300">Video {index + 1}</p>
                  <h3 className="mt-2 text-xl font-black text-white">{video.title}</h3>
                  <p className="mt-1 text-xs text-white/38">{video.audience}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-2 text-purple-200">
                  <PlayCircle className="size-5" />
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/[0.055] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Hook</p>
                <p className="mt-1 text-sm leading-6 text-white/72">{video.hook}</p>
              </div>

              <div className="space-y-2">
                {video.script.map((line) => (
                  <div key={line} className="flex gap-2 text-sm leading-6 text-white/58">
                    <ArrowRight className="mt-1 size-3.5 shrink-0 text-emerald-300" />
                    <p>{line}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">Emotion</p>
                  <p className="mt-1 text-sm text-white/65">{video.emotion}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">Visual Direction</p>
                  <p className="mt-1 text-sm leading-6 text-white/55">{video.visual}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Camera className="size-3.5" /> {video.cta}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-purple-400/15 bg-purple-500/[0.04] p-5">
          <div className="flex items-center gap-2 text-purple-200">
            <Sparkles className="size-5" />
            <h2 className="text-sm font-black uppercase tracking-[0.18em]">AI Tool Stack</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Best first workflow: record Fonz talking-head manually, then use CapCut/Pippit for captions and cuts. Use HeyGen/VisionStory only when you need avatar scale. Use Runway/Kling/Pika-style tools for B-roll, not for the core trust-building face-to-camera message.
          </p>
        </section>
      </div>
    </main>
  );
}
