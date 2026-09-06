import type { Book, Section, Settings } from '../types';
import { sectionLabel } from '../store';

export type PromptKind = 'transcribe' | 'section' | 'recap' | 'cards' | 'discuss' | 'outline' | 'storySoFar';

export type PromptDef = {
  kind: PromptKind;
  title: string;
  blurb: string;
  icon: string;
  /** what the user has to do in the other app besides pasting the prompt */
  attach?: string;
};

export const PROMPTS: PromptDef[] = [
  {
    kind: 'transcribe',
    title: 'Transcribe page photos',
    blurb: 'Turn photos of pages into text when on-device scanning is not available.',
    icon: '🔤',
    attach: 'Attach the page photos in the other app before sending.',
  },
  {
    kind: 'section',
    title: 'Summarise this chapter',
    blurb: 'Summary, key points, characters, quotes, vocabulary and a recap — fills the whole chapter screen.',
    icon: '📖',
  },
  {
    kind: 'recap',
    title: 'Recap before I continue',
    blurb: '"Previously on…" refresher built from everything you have read so far.',
    icon: '⏪',
  },
  {
    kind: 'cards',
    title: 'Make review cards',
    blurb: 'Question/answer cards that land in the Review tab with spaced repetition.',
    icon: '🎴',
  },
  {
    kind: 'discuss',
    title: 'Go deeper',
    blurb: 'Themes, symbolism and discussion questions for this chapter.',
    icon: '🔍',
  },
  {
    kind: 'outline',
    title: 'Outline the book',
    blurb: 'Blurb, genre, tags and a chapter list — creates the chapters for you.',
    icon: '🗂️',
  },
  {
    kind: 'storySoFar',
    title: 'Story so far',
    blurb: 'One running summary of the whole book up to where you are.',
    icon: '🧵',
  },
];

const JSON_RULES = [
  'Reply with ONE JSON object and nothing else.',
  'No markdown, no code fence, no commentary before or after.',
  'Use "" or [] for anything you cannot fill in. Never invent page numbers or events that are not in the text.',
].join(' ');

const MAX_CHAPTER_CHARS = 15000;

/**
 * When a chapter runs long, drop whole pages off the START rather than cutting
 * the END. This prompt is pasted into an ongoing AI chat, so the AI already has
 * the earlier pages from earlier turns in that same conversation — what it's
 * missing, if anything gets cut, is where the chapter finishes, which is the
 * part actually worth keeping.
 */
function clipToTail(section: Section, max = MAX_CHAPTER_CHARS) {
  const pages = section.pages.filter((p) => p.text.trim());
  const render = (list: typeof pages) =>
    list.map((p) => (p.label ? `[p. ${p.label}]\n${p.text.trim()}` : p.text.trim())).join('\n\n');

  let dropped = 0;
  let text = render(pages);
  const fits = text.length <= max;
  while (text.length > max && dropped < pages.length - 1) {
    dropped += 1;
    text = render(pages.slice(dropped));
  }
  // A single page longer than the whole budget still needs a hard cut — keep its end.
  const hardCut = text.length > max;
  if (hardCut) text = text.slice(text.length - max);

  return { text, truncated: !fits, dropped };
}

/**
 * One line per earlier chapter, for the recap / story-so-far prompts. Prefers the
 * saved AI summary or recap; if a chapter has neither (nothing has been applied
 * for it yet) it falls back to that chapter's own raw page text instead of
 * skipping it, so recap isn't just "(nothing summarised yet)" the moment you
 * haven't run "Summarise this chapter" on everything. If there's nothing to say
 * about any earlier chapter at all, falls back to the pages read so far in the
 * current chapter, since that's read material too.
 */
function buildPriorContext(previous: Section[], current?: Section) {
  const lines = previous
    .map((s) => {
      if (s.summary || s.recap) return `- ${sectionLabel(s)}: ${(s.summary || s.recap).replace(/\s+/g, ' ').slice(0, 700)}`;
      const raw = sectionText(s).trim();
      return raw ? `- ${sectionLabel(s)} (not summarised yet, raw page text): ${raw.replace(/\s+/g, ' ').slice(0, 700)}` : null;
    })
    .filter((line): line is string => !!line);

  if (!lines.length && current) {
    const raw = sectionText(current).trim();
    if (raw) {
      lines.push(
        `- ${sectionLabel(current)} so far (not summarised yet, raw page text): ${raw.replace(/\s+/g, ' ').slice(-700)}`
      );
    }
  }

  return lines.join('\n');
}

export function sectionText(section: Section) {
  return section.pages
    .filter((p) => p.text.trim())
    .map((p) => (p.label ? `[p. ${p.label}]\n${p.text.trim()}` : p.text.trim()))
    .join('\n\n');
}

function header(book: Book, section?: Section, settings?: Settings) {
  const bits = [`Book: "${book.title}"${book.author ? ` by ${book.author}` : ''}`];
  if (section) bits.push(`Chapter: ${sectionLabel(section)}`);
  if (settings?.language && settings.language !== 'English') bits.push(`Write in ${settings.language}.`);
  if (settings?.spoilerSafe) bits.push('Absolutely no spoilers beyond the text I give you.');
  return bits.join('\n');
}

export type BuildArgs = {
  kind: PromptKind;
  book: Book;
  section?: Section;
  /** earlier sections, in order, used for recaps */
  previous?: Section[];
  settings: Settings;
};

export function buildPrompt({ kind, book, section, previous = [], settings }: BuildArgs): string {
  const flavour = settings.promptFlavour.trim() ? `\n\nExtra instruction from me: ${settings.promptFlavour.trim()}` : '';
  const clipped = section ? clipToTail(section) : { text: '', truncated: false, dropped: 0 };
  const text = clipped.text;
  // Recap/story-so-far draw on earlier chapters' saved summaries — but most chapters
  // won't have one until you actually run "Summarise this chapter" and apply it. Until
  // then, fall back to the raw page text so recap isn't empty just because you haven't
  // done that step, and say plainly that it's unedited text rather than a summary.
  const priorSummaries = buildPriorContext(previous, section);
  const truncationNote = clipped.truncated
    ? clipped.dropped > 0
      ? `\nNote: this chapter is long, so the earliest ${clipped.dropped} page(s) are left out below — you already have those from earlier in this chat. Pick up the summary using that earlier context plus what follows.`
      : `\nNote: this single page ran long, so the start of it is left out below — you already have it from earlier in this chat.`
    : '';

  switch (kind) {
    case 'transcribe':
      return [
        header(book, section, settings),
        '',
        'I am attaching photos of the pages of this book. Some photos show a two-page spread — read the left page fully, then the right page.',
        'Transcribe the text exactly as printed. Keep paragraph breaks. Do not summarise, correct, translate or comment. Repair words split by hyphens at line ends. Ignore headers, footers and page numbers in the text itself, but do put the page numbers you see in the "label" field — I use those to track where I am, so give me one entry per photo even if you can only read part of it.',
        '',
        JSON_RULES,
        'Shape:',
        '{"kind":"transcribe","pages":[{"label":"12-13","text":"full text of that photo"}]}',
        flavour,
      ].join('\n');

    case 'section':
      return [
        header(book, section, settings),
        '',
        'Here is the text of the chapter I just read:',
        '"""',
        text || '(no text captured yet — say so in the summary field)',
        '"""',
        truncationNote,
        '',
        'Analyse it for my reading journal.',
        JSON_RULES,
        'Shape:',
        `{"kind":"section",
 "title":"a short chapter title if the text shows one, else a fitting one",
 "recap":"2-3 sentences I can read to remember this chapter later",
 "summary":"4-8 sentence summary of what actually happens",
 "keyPoints":["the most important beats, 3-7 of them"],
 "themes":["short theme labels"],
 "characters":[{"name":"who","note":"what they do or reveal here"}],
 "quotes":[{"text":"a striking line, copied exactly","page":"12"}],
 "vocabulary":[{"word":"unusual word from the text","meaning":"plain meaning"}],
 "mood":"one or two words",
 "difficulty":3,
 "cards":[{"q":"recall question","a":"answer"}]}`,
        flavour,
      ].join('\n');

    case 'recap':
      return [
        header(book, section, settings),
        '',
        'This is what I have read so far, in order:',
        priorSummaries || '(nothing summarised yet)',
        '',
        'I am about to pick the book back up after a break. Write me a "previously on" refresher: where the story stands, who matters right now, open questions, and what to watch for. Do not reveal anything past the point above.',
        JSON_RULES,
        'Shape:',
        '{"kind":"recap","recap":"the refresher, 1-2 paragraphs","keyPoints":["where things stand"],"characters":[{"name":"who","note":"why they matter right now"}]}',
        flavour,
      ].join('\n');

    case 'cards':
      return [
        header(book, section, settings),
        '',
        'Chapter text:',
        '"""',
        text || (section?.summary ?? ''),
        '"""',
        truncationNote,
        '',
        'Make 8-12 recall cards that would help me remember this chapter in a month. Mix plot, characters, and any facts or vocabulary worth keeping. Questions must be answerable from the text alone.',
        JSON_RULES,
        'Shape:',
        '{"kind":"cards","cards":[{"q":"question","a":"short answer"}]}',
        flavour,
      ].join('\n');

    case 'discuss':
      return [
        header(book, section, settings),
        '',
        'Chapter text or summary:',
        '"""',
        text || (section?.summary ?? ''),
        '"""',
        truncationNote,
        '',
        'Take me deeper into this chapter: what is really going on under the surface, the craft choices, the symbols, and questions worth sitting with. Speak plainly, no jargon.',
        JSON_RULES,
        'Shape:',
        '{"kind":"discuss","notes":"the deeper reading, a few paragraphs","themes":["theme labels"],"cards":[{"q":"discussion question","a":"a way into it"}]}',
        flavour,
      ].join('\n');

    case 'outline':
      return [
        `Book: "${book.title}"${book.author ? ` by ${book.author}` : ''}`,
        '',
        'Set up my reading journal for this book. Give me the publisher-style blurb, the genre, useful tags, and the list of chapters or parts in order with their real titles if you know them. Do not spoil the plot in the blurb. If you are not sure of the chapter list, return an empty list rather than inventing one.',
        JSON_RULES,
        'Shape:',
        '{"kind":"outline","title":"corrected title","author":"author","genre":"genre","tags":["tag"],"blurb":"back-cover blurb","totalPages":320,"sections":[{"kind":"Chapter","number":"1","title":"chapter title"}]}',
        flavour,
      ].join('\n');

    case 'storySoFar':
      return [
        header(book, undefined, settings),
        '',
        'Chapter summaries so far, in order:',
        priorSummaries || '(nothing summarised yet)',
        '',
        'Weave these into one flowing "story so far" I can reread any time — the throughline, not a list. Then note the threads still hanging.',
        JSON_RULES,
        'Shape:',
        '{"kind":"storySoFar","storySoFar":"the woven summary","keyPoints":["open threads"]}',
        flavour,
      ].join('\n');
  }
}
