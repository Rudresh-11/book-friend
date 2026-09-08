import type { CastVoice, NarrationLine, Section } from '../types';
import { sectionText } from './prompts';

export const NARRATOR = 'Narrator';

/** Straight and curly quote pairs, so dialogue is found however the book prints it. */
const QUOTE_PAIRS: [string, string][] = [
  ['"', '"'],
  ['“', '”'],
  ['‘', '’'],
];

/**
 * Split prose into narration and dialogue without any AI: anything inside
 * quotation marks is someone speaking, everything else is the narrator. Where
 * the text says who spoke ("...", said Bilbo / Bilbo said, "...") that name is
 * picked up, so the right voice is used even with no script.
 */
export function scriptFromText(text: string, knownNames: string[] = []): NarrationLine[] {
  const lines: NarrationLine[] = [];
  const push = (speaker: string, chunk: string) => {
    const clean = chunk.replace(/\s+/g, ' ').trim();
    if (clean) lines.push({ speaker, text: clean });
  };

  let buffer = '';
  let quote = '';
  let closing = '';
  /** dialogue speakers so far, so an unattributed line can follow the conversation */
  const spoken: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!closing) {
      const pair = QUOTE_PAIRS.find(([open]) => open === ch);
      if (pair) {
        push(NARRATOR, buffer);
        closing = pair[1];
        quote = '';
        continue;
      }
      buffer += ch;
    } else if (ch === closing) {
      const speaker = speakerNear(buffer, text.slice(i + 1, i + 120), knownNames, spoken);
      push(speaker, quote);
      spoken.push(speaker);
      buffer = '';
      quote = '';
      closing = '';
    } else {
      quote += ch;
    }
  }
  push(NARRATOR, buffer + quote);

  return splitLongLines(lines);
}

const VERBS =
  'said|says|asked|asks|replied|answered|whispered|shouted|cried|muttered|called|added|murmured|growled|laughed|sighed|snapped|begged|told';

/**
 * Who said the line. Attribution attaches to the quote it touches, so the text
 * after the quote only counts up to the end of that paragraph — otherwise a
 * following sentence like "Neema said nothing at all" steals the line from
 * whoever was actually speaking.
 */
function speakerNear(before: string, after: string, knownNames: string[], spoken: string[]): string {
  const sameParagraphAfter = after.split(/\n\s*\n/)[0];
  const tail = before.slice(-120);
  // only the last paragraph before the quote can be talking about this speaker
  const sameParagraphBefore = tail.split(/\n\s*\n/).pop() ?? '';

  for (const hay of [sameParagraphAfter, sameParagraphBefore]) {
    const withVerbFirst = hay.match(new RegExp(`\\b(?:${VERBS})\\s+([A-Z][\\w'’-]+)`));
    if (withVerbFirst) return match(withVerbFirst[1], knownNames);
    const nameFirst = hay.match(new RegExp(`\\b([A-Z][\\w'’-]+)\\s+(?:${VERBS})\\b`));
    if (nameFirst) return match(nameFirst[1], knownNames);
  }

  // Unattributed. Two conventions carry most prose: a second quote in the same
  // paragraph is the same person still talking, and a new paragraph in a
  // back-and-forth is the other person's turn.
  const newParagraph = /\n\s*\n/.test(before);
  if (spoken.length) {
    if (!newParagraph) return spoken[spoken.length - 1];
    const others = spoken.filter((s) => s !== spoken[spoken.length - 1]);
    if (others.length) return others[others.length - 1];
  }

  for (const name of knownNames) {
    const first = name.split(/\s+/)[0];
    if (first && (sameParagraphAfter.includes(first) || sameParagraphBefore.includes(first))) return name;
  }
  return 'Someone';
}

function match(found: string, knownNames: string[]) {
  const hit = knownNames.find(
    (n) => n.toLowerCase() === found.toLowerCase() || n.toLowerCase().split(/\s+/)[0] === found.toLowerCase()
  );
  return hit ?? found;
}

/**
 * Long paragraphs are broken at sentence ends. Each line is one utterance, and
 * short utterances are what make the reading followable and stoppable.
 */
function splitLongLines(lines: NarrationLine[], max = 300): NarrationLine[] {
  const out: NarrationLine[] = [];
  for (const line of lines) {
    if (line.text.length <= max) {
      out.push(line);
      continue;
    }
    const sentences = line.text.match(/[^.!?]+[.!?]*\s*/g) ?? [line.text];
    let chunk = '';
    for (const sentence of sentences) {
      if ((chunk + sentence).length > max && chunk) {
        out.push({ ...line, text: chunk.trim() });
        chunk = '';
      }
      chunk += sentence;
    }
    if (chunk.trim()) out.push({ ...line, text: chunk.trim() });
  }
  return out;
}

/** The script for a chapter: the AI-cast one if it has been applied, else the plain reading. */
export function scriptFor(section: Section): NarrationLine[] {
  if (section.narration.length) return splitLongLines(section.narration);
  return scriptFromText(sectionText(section).replace(/^\[p\..*?\]\s*/gm, ''), section.characters.map((c) => c.name));
}

/** Every voice a script needs, narrator first. */
export function speakersIn(lines: NarrationLine[]): string[] {
  const seen = new Set<string>();
  for (const l of lines) seen.add(l.speaker || NARRATOR);
  return [NARRATOR, ...Array.from(seen).filter((s) => s !== NARRATOR)];
}

/**
 * Mood nudges the delivery. The phone's voices cannot act, but pace and pitch
 * carry a surprising amount: fear runs quick and high, grief slow and low.
 */
const MOODS: Record<string, { rate: number; pitch: number }> = {
  afraid: { rate: 1.12, pitch: 1.12 },
  scared: { rate: 1.12, pitch: 1.12 },
  urgent: { rate: 1.15, pitch: 1.05 },
  excited: { rate: 1.12, pitch: 1.1 },
  angry: { rate: 1.08, pitch: 0.88 },
  stern: { rate: 0.95, pitch: 0.88 },
  sad: { rate: 0.85, pitch: 0.92 },
  grieving: { rate: 0.8, pitch: 0.9 },
  tender: { rate: 0.88, pitch: 1.05 },
  gentle: { rate: 0.9, pitch: 1.04 },
  whisper: { rate: 0.85, pitch: 1.08 },
  tense: { rate: 1.05, pitch: 0.96 },
  solemn: { rate: 0.85, pitch: 0.9 },
  happy: { rate: 1.06, pitch: 1.08 },
  amused: { rate: 1.02, pitch: 1.08 },
  thoughtful: { rate: 0.9, pitch: 0.98 },
};

export function moodShift(mood?: string) {
  if (!mood) return { rate: 1, pitch: 1 };
  const key = Object.keys(MOODS).find((m) => mood.toLowerCase().includes(m));
  return key ? MOODS[key] : { rate: 1, pitch: 1 };
}

/**
 * Give each character a distinguishable default before you tune anything: they
 * fan out around the narrator's pitch so two characters never sound identical.
 */
export function defaultVoiceFor(name: string, index: number): CastVoice {
  if (name === NARRATOR) return { name, pitch: 1, rate: 1 };
  const spread = [1.25, 0.8, 1.12, 0.88, 1.35, 0.72, 1.05, 0.95];
  return { name, pitch: spread[index % spread.length], rate: index % 2 ? 0.97 : 1.03 };
}

/** How a given line should be spoken, folding together cast voice, mood and settings. */
export function deliveryFor(
  line: NarrationLine,
  cast: CastVoice[],
  baseRate: number,
  basePitch: number,
  narratorVoice?: string
) {
  const speaker = line.speaker || NARRATOR;
  const assigned = cast.find((c) => c.name.toLowerCase() === speaker.toLowerCase());
  const mood = moodShift(line.mood);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  return {
    voice: assigned?.voice ?? (speaker === NARRATOR ? narratorVoice : undefined) ?? narratorVoice,
    rate: clamp(baseRate * (assigned?.rate ?? 1) * mood.rate, 0.4, 2),
    pitch: clamp(basePitch * (assigned?.pitch ?? 1) * mood.pitch, 0.5, 2),
  };
}
