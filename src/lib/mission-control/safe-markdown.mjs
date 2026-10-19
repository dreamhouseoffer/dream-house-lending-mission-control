// Minimal block-level markdown tokenizer for previews. It produces plain data (no HTML strings): the React renderer
// emits every token's text as a text node, so raw HTML in a draft (e.g. <script>) is shown literally, never executed.
// Inline markup (links, emphasis) is intentionally not interpreted; link targets are never made clickable.

export const PREVIEW_MAX_LINES = 20_000;

/**
 * @param {string} source
 * @returns {{ type: "heading" | "paragraph" | "list" | "code" | "quote" | "rule", level?: number, ordered?: boolean, text?: string, items?: string[] }[]}
 */
export function tokenizeMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n").slice(0, PREVIEW_MAX_LINES);
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) out.push({ type: "paragraph", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list) out.push(list);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      flushPara();
      flushList();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i++]);
      out.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      out.push({ type: "heading", level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, "") });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push({ type: "rule" });
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d{1,4}[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: "list", ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)[1]);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushPara();
      flushList();
      const prev = out[out.length - 1];
      if (prev && prev.type === "quote") prev.text += `\n${quote[1]}`;
      else out.push({ type: "quote", text: quote[1] });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out;
}

/** Pretty JSON for preview; falls back to the raw text when it does not parse. */
export function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
