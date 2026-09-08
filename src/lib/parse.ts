import type { PromptKind } from './prompts';

export type AiPayload = {
  kind?: string;
  title?: string;
  author?: string;
  genre?: string;
  tags?: string[];
  blurb?: string;
  totalPages?: number;
  recap?: string;
  summary?: string;
  notes?: string;
  storySoFar?: string;
  mood?: string;
  difficulty?: number;
  keyPoints?: string[];
  themes?: string[];
  characters?: { name: string; note?: string }[];
  quotes?: { text: string; page?: string; note?: string }[];
  vocabulary?: { word: string; meaning?: string }[];
  panels?: { scene: string; prompt: string }[];
  pages?: { label?: string; text: string }[];
  sections?: { kind?: string; number?: string; title?: string }[];
};

export type ParseResult =
  | { ok: true; data: AiPayload; loose: boolean }
  | { ok: false; error: string };

/** Pull the outermost {...} out of a reply that may be wrapped in prose or a code fence. */
function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const hay = fenced ? fenced[1] : raw;
  const start = hay.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < hay.length; i++) {
    const ch = hay[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return hay.slice(start, i + 1);
    }
  }
  return null;
}

function relax(json: string) {
  return json
    .replace(/,\s*([}\]])/g, '$1') // trailing commas
    .replace(/[“”]/g, '"') // smart quotes that leaked into keys
    .replace(/[‘’]/g, "'");
}

const asStrings = (v: any): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.text ?? x?.name ?? '')).filter(Boolean) : [];

/**
 * Parse whatever the user pasted. Falls back to treating a plain-text reply as
 * the main field for the prompt kind, so a chatty AI still updates something.
 */
export function parseAiResponse(kind: PromptKind, raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Nothing pasted yet.' };

  const jsonText = extractJson(trimmed);
  if (jsonText) {
    for (const candidate of [jsonText, relax(jsonText)]) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return { ok: true, data: normalise(parsed), loose: false };
      } catch {
        /* try the relaxed version next */
      }
    }
  }

  // No usable JSON — keep the text rather than losing the user's round trip.
  const looseField: Record<PromptKind, keyof AiPayload> = {
    transcribe: 'notes',
    section: 'summary',
    recap: 'recap',
    comic: 'notes',
    discuss: 'notes',
    outline: 'blurb',
    storySoFar: 'storySoFar',
  };
  if (kind === 'transcribe') {
    return { ok: true, data: { pages: [{ text: trimmed }] }, loose: true };
  }
  return { ok: true, data: { [looseField[kind]]: trimmed } as AiPayload, loose: true };
}

function normalise(raw: any): AiPayload {
  const out: AiPayload = {};
  const str = (v: any) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

  out.kind = str(raw.kind);
  out.title = str(raw.title);
  out.author = str(raw.author);
  out.genre = str(raw.genre);
  out.blurb = str(raw.blurb);
  out.recap = str(raw.recap);
  out.summary = str(raw.summary);
  out.notes = str(raw.notes ?? raw.analysis ?? raw.deeper);
  out.storySoFar = str(raw.storySoFar ?? raw.story_so_far);
  out.mood = str(raw.mood);

  if (typeof raw.difficulty === 'number') out.difficulty = Math.max(0, Math.min(5, Math.round(raw.difficulty)));
  if (typeof raw.totalPages === 'number') out.totalPages = raw.totalPages;

  out.tags = asStrings(raw.tags);
  out.keyPoints = asStrings(raw.keyPoints ?? raw.key_points ?? raw.points);
  out.themes = asStrings(raw.themes);

  out.characters = Array.isArray(raw.characters)
    ? raw.characters
        .map((c: any) =>
          typeof c === 'string' ? { name: c, note: '' } : { name: str(c?.name), note: str(c?.note ?? c?.role) }
        )
        .filter((c: any) => c.name)
    : [];

  out.quotes = Array.isArray(raw.quotes)
    ? raw.quotes
        .map((q: any) => (typeof q === 'string' ? { text: q } : { text: str(q?.text ?? q?.quote), page: str(q?.page), note: str(q?.note) }))
        .filter((q: any) => q.text)
    : [];

  out.vocabulary = Array.isArray(raw.vocabulary ?? raw.words)
    ? (raw.vocabulary ?? raw.words)
        .map((v: any) =>
          typeof v === 'string' ? { word: v, meaning: '' } : { word: str(v?.word ?? v?.term), meaning: str(v?.meaning ?? v?.definition) }
        )
        .filter((v: any) => v.word)
    : [];

  out.panels = Array.isArray(raw.panels ?? raw.scenes ?? raw.comic)
    ? (raw.panels ?? raw.scenes ?? raw.comic)
        .map((p: any) =>
          typeof p === 'string'
            ? { scene: p, prompt: p }
            : {
                scene: str(p?.scene ?? p?.caption ?? p?.description ?? p?.text),
                prompt: str(p?.prompt ?? p?.imagePrompt ?? p?.image_prompt ?? p?.image),
              }
        )
        // a panel with only one of the two is still worth keeping — fall back to the other
        .map((p: any) => ({ scene: p.scene || p.prompt, prompt: p.prompt || p.scene }))
        .filter((p: any) => p.scene || p.prompt)
    : [];

  out.pages = Array.isArray(raw.pages)
    ? raw.pages
        .map((p: any) => (typeof p === 'string' ? { text: p } : { label: str(p?.label ?? p?.page), text: str(p?.text) }))
        .filter((p: any) => p.text)
    : [];

  out.sections = Array.isArray(raw.sections ?? raw.chapters)
    ? (raw.sections ?? raw.chapters)
        .map((s: any, i: number) =>
          typeof s === 'string'
            ? { number: String(i + 1), title: s }
            : { kind: str(s?.kind), number: str(s?.number) || String(i + 1), title: str(s?.title) }
        )
        .filter((s: any) => s.title || s.number)
    : [];

  return out;
}

/** Human-readable list of what an applied payload changed. */
export function describeChanges(d: AiPayload): string[] {
  const out: string[] = [];
  const push = (n: number | undefined, label: string) => {
    if (n) out.push(`${n} ${label}${n === 1 ? '' : 's'}`);
  };
  if (d.summary) out.push('summary');
  if (d.recap) out.push('recap');
  if (d.storySoFar) out.push('story so far');
  if (d.notes) out.push('notes');
  if (d.blurb) out.push('blurb');
  if (d.title) out.push('title');
  push(d.keyPoints?.length, 'key point');
  push(d.themes?.length, 'theme');
  push(d.characters?.length, 'character');
  push(d.quotes?.length, 'quote');
  push(d.vocabulary?.length, 'vocabulary word');
  push(d.panels?.length, 'comic panel');
  push(d.pages?.length, 'transcribed page');
  push(d.sections?.length, 'chapter');
  return out;
}
