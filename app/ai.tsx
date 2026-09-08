import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, Collapsible, Field, Label, Row, SectionHeading, Title } from '../src/components/ui';
import { copyText } from '../src/lib/clipboard';
import { goBack } from '../src/lib/nav';
import { wordCount } from '../src/lib/ocr';
import { describeChanges, parseAiResponse } from '../src/lib/parse';
import { buildPrompt, PROMPTS, type PromptKind } from '../src/lib/prompts';
import { sectionsOf, useLibrary } from '../src/store';
import { radius, useTheme } from '../src/theme';
import type { SectionKind } from '../src/types';

export default function AiBridge() {
  const params = useLocalSearchParams<{ kind?: string; bookId?: string; sectionId?: string }>();
  const t = useTheme();
  const state = useLibrary();
  const store = useLibrary();

  const [kind, setKind] = useState<PromptKind>((params.kind as PromptKind) ?? 'section');
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState<Saved[] | null>(null);
  const [replaceChapters, setReplaceChapters] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const book = state.books.find((b) => b.id === params.bookId);
  const section = state.sections.find((s) => s.id === params.sectionId);
  const siblings = book ? sectionsOf(state, book.id) : [];
  const previous = section ? siblings.filter((s) => s.order < section.order) : siblings.filter((s) => s.status === 'read');

  const def = PROMPTS.find((p) => p.kind === kind)!;
  const needsSection = kind === 'section' || kind === 'comic' || kind === 'discuss' || kind === 'transcribe';

  const prompt = useMemo(() => {
    if (!book) return '';
    return buildPrompt({ kind, book, section, previous, settings: state.settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, book, section, previous.length, state.settings]);

  const parsed = useMemo(() => (reply.trim() ? parseAiResponse(kind, reply) : null), [kind, reply]);

  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body muted>Open this from a book or chapter.</Body>
      </View>
    );
  }

  const copy = async () => {
    if (!(await copyText(prompt))) return;
    setCopied(true);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => setCopied(false), 2500);
  };

  const pasteFromClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    if (text?.trim()) setReply(text);
  };

  const apply = () => {
    if (!parsed?.ok) return;
    const d = parsed.data;
    const report: Saved[] = [];
    const add = (entry: Saved) => report.push(entry);

    /* ---- book-level fields ---- */
    const bookPatch: Record<string, unknown> = {};
    if (kind === 'outline') {
      const details: Pair[] = [];
      if (d.title && d.title !== book.title) {
        bookPatch.title = d.title;
        details.push({ k: 'Title', v: `${book.title} → ${d.title}` });
      }
      if (d.author && d.author !== book.author) {
        bookPatch.author = d.author;
        details.push({ k: 'Author', v: d.author });
      }
      if (d.genre) {
        bookPatch.genre = d.genre;
        details.push({ k: 'Genre', v: d.genre });
      }
      if (d.totalPages) {
        bookPatch.totalPages = d.totalPages;
        details.push({ k: 'Pages', v: String(d.totalPages) });
      }
      if (details.length) add({ title: 'Book details', where: 'on the book', pairs: details });

      if (d.blurb) {
        bookPatch.blurb = d.blurb;
        add({ title: 'Blurb', where: 'on the book', body: d.blurb, note: book.blurb ? 'replaced the old blurb' : undefined });
      }
      if (d.tags?.length) {
        const merged = merge(book.tags, d.tags);
        bookPatch.tags = merged;
        add({
          title: 'Tags',
          where: 'on the book',
          items: d.tags,
          note: countNote(book.tags.length, merged.length, d.tags.length),
        });
      }
    }
    if (d.storySoFar) {
      bookPatch.storySoFar = d.storySoFar;
      add({
        title: 'Story so far',
        where: 'on the book',
        body: d.storySoFar,
        note: book.storySoFar ? 'replaced the previous one' : undefined,
      });
    }
    if (kind === 'recap' && !section && d.recap && !d.storySoFar) {
      bookPatch.storySoFar = d.recap;
      add({ title: 'Recap', where: 'saved as the book’s story so far', body: d.recap });
    }
    // "Story so far" and a book-level recap answer with key points (the threads still
    // hanging) and who matters right now. There is no chapter to hang those on, so
    // they belong to the book — before this they were parsed and then dropped.
    if (!section) {
      if (d.keyPoints?.length) {
        const merged = merge(book.openThreads, d.keyPoints);
        bookPatch.openThreads = merged;
        add({
          title: 'Open threads',
          where: 'on the book, under the story so far',
          items: d.keyPoints,
          note: countNote(book.openThreads.length, merged.length, d.keyPoints.length),
        });
      }
      if (d.characters?.length) {
        const incoming = d.characters.map((c) => ({ name: c.name, note: c.note ?? '' }));
        const merged = mergeBy([...incoming, ...book.keyPeople], (c) => c.name);
        bookPatch.keyPeople = merged;
        add({
          title: 'Who matters right now',
          where: 'on the book, under the story so far',
          pairs: incoming.map((c) => ({ k: c.name, v: c.note })),
          note: countNote(book.keyPeople.length, merged.length, incoming.length),
        });
      }
    }
    if (Object.keys(bookPatch).length) store.updateBook(book.id, bookPatch as any);

    /* ---- chapters from an outline ---- */
    if (kind === 'outline' && d.sections?.length) {
      if (replaceChapters) siblings.forEach((s) => store.removeSection(s.id));
      const made = d.sections.map((s) => ({
        kind: (s.kind as SectionKind) || state.settings.defaultKind,
        number: s.number ?? '',
        title: s.title ?? '',
      }));
      store.addSections(book.id, made);
      add({
        title: 'Chapters',
        where: 'in the chapter list',
        items: made.map((s) => [s.kind, s.number, s.title && `— ${s.title}`].filter(Boolean).join(' ')),
        note: replaceChapters
          ? `replaced the ${siblings.length} chapters that were there`
          : siblings.length
            ? `added after the ${siblings.length} you already had`
            : undefined,
      });
    }

    /* ---- transcription lands on the page scans ---- */
    if (kind === 'transcribe' && section && d.pages?.length) {
      const untouched = [...section.pages];
      const onto: string[] = [];
      let created = 0;
      d.pages.forEach((p) => {
        const byLabel = p.label ? untouched.find((x) => x.label === p.label) : undefined;
        const target = byLabel ?? untouched.find((x) => !x.text.trim());
        const words = wordCount(p.text);
        if (target) {
          store.updatePage(section.id, target.id, {
            text: p.text,
            textSource: 'ai',
            label: target.label || p.label || '',
          });
          untouched.splice(untouched.indexOf(target), 1);
          onto.push(`p. ${target.label || p.label || '?'} · ${words} words → existing scan`);
        } else {
          // No photo waiting for this text, so keep the page as a text-only entry.
          store.addPage(section.id, {
            uri: '',
            label: p.label ?? '',
            spread: !!p.label && /\d\s*[-–]\s*\d/.test(p.label),
            text: p.text,
            textSource: 'ai',
          });
          created += 1;
          onto.push(`p. ${p.label || '?'} · ${words} words → new page, no photo`);
        }
      });
      add({
        title: 'Transcribed pages',
        where: 'in page scans',
        items: onto,
        note: created ? `${created} added as text-only pages` : undefined,
      });
    }

    /* ---- everything else lands on the chapter ---- */
    if (section && kind !== 'transcribe') {
      const patch: Record<string, unknown> = { aiUpdatedAt: Date.now() };

      if (d.title && !section.title) {
        patch.title = d.title;
        add({ title: 'Chapter title', where: 'on this chapter', body: d.title });
      }
      if (d.recap) {
        patch.recap = d.recap;
        add({ title: 'Recap', where: 'on this chapter', body: d.recap, note: section.recap ? 'replaced the old recap' : undefined });
      }
      if (d.summary) {
        patch.summary = d.summary;
        add({ title: 'Summary', where: 'on this chapter', body: d.summary, note: section.summary ? 'replaced the old summary' : undefined });
      }
      if (d.mood || d.difficulty) {
        if (d.mood) patch.mood = d.mood;
        if (d.difficulty) patch.difficulty = d.difficulty;
        add({
          title: 'Reading feel',
          where: 'on this chapter',
          pairs: [
            ...(d.mood ? [{ k: 'Mood', v: d.mood }] : []),
            ...(d.difficulty ? [{ k: 'Difficulty', v: `${d.difficulty}/5` }] : []),
          ],
        });
      }
      if (d.keyPoints?.length) {
        const merged = merge(section.keyPoints, d.keyPoints);
        patch.keyPoints = merged;
        add({ title: 'Key points', where: 'on this chapter', items: d.keyPoints, note: countNote(section.keyPoints.length, merged.length, d.keyPoints.length) });
      }
      if (d.themes?.length) {
        const merged = merge(section.themes, d.themes);
        patch.themes = merged;
        add({ title: 'Themes', where: 'on this chapter', items: d.themes, note: countNote(section.themes.length, merged.length, d.themes.length) });
      }
      if (d.characters?.length) {
        const incoming = d.characters.map((c) => ({ name: c.name, note: c.note ?? '' }));
        const merged = mergeBy([...section.characters, ...incoming], (c) => c.name);
        patch.characters = merged;
        add({
          title: "Who's who",
          where: 'on this chapter',
          pairs: incoming.map((c) => ({ k: c.name, v: c.note })),
          note: countNote(section.characters.length, merged.length, incoming.length),
        });
      }
      if (d.quotes?.length) {
        const incoming = d.quotes.map((q) => ({ text: q.text, page: q.page, note: q.note }));
        const merged = mergeBy([...section.quotes, ...incoming], (q) => q.text);
        patch.quotes = merged;
        add({
          title: 'Lines worth keeping',
          where: 'on this chapter',
          items: incoming.map((q) => (q.page ? `“${q.text}” (p. ${q.page})` : `“${q.text}”`)),
          note: countNote(section.quotes.length, merged.length, incoming.length),
        });
      }
      if (d.vocabulary?.length) {
        const incoming = d.vocabulary.map((v) => ({ word: v.word, meaning: v.meaning ?? '' }));
        const merged = mergeBy([...section.vocabulary, ...incoming], (v) => v.word.toLowerCase());
        patch.vocabulary = merged;
        add({
          title: 'Words',
          where: 'on this chapter',
          pairs: incoming.map((v) => ({ k: v.word, v: v.meaning })),
          note: countNote(section.vocabulary.length, merged.length, incoming.length),
        });
      }
      if (d.notes) {
        patch.myNotes = [section.myNotes, d.notes].filter(Boolean).join('\n\n');
        add({ title: 'Deeper reading', where: 'added to my notes', body: d.notes });
      }
      store.updateSection(section.id, patch as any);

      if (d.panels?.length) {
        const panels = d.panels.map((p) => ({ scene: p.scene, prompt: p.prompt }));
        store.addPanels(section.id, panels);
        add({
          title: 'Comic panels',
          where: 'in this chapter’s comic',
          items: panels.map((p, i) => `${i + 1}. ${p.scene}`),
          note:
            section.comic.length
              ? `${panels.length} added after the ${section.comic.length} already drawn`
              : 'open the comic to make the pictures',
        });
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setApplied(report);
  };

  /* ---------- applied confirmation ---------- */
  if (applied) {
    const summary = applied.length
      ? applied.map((s) => s.title.toLowerCase()).join(', ')
      : 'nothing the app recognised';
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
        <Stack.Screen options={{ title: 'Saved' }} />
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
          <Ionicons name={applied.length ? 'checkmark-circle' : 'alert-circle'} size={52} color={applied.length ? t.good : t.danger} />
          <Title style={{ textAlign: 'center' }}>
            {applied.length ? 'Saved to your journal' : 'Nothing to save'}
          </Title>
          <Body muted style={{ textAlign: 'center' }}>
            {applied.length
              ? `${applied.length} ${applied.length === 1 ? 'thing' : 'things'} updated — ${summary}.`
              : 'That reply had nothing the app could file. Ask the AI to answer with only the JSON object and try again.'}
          </Body>
        </View>

        {applied.map((entry, i) => (
          <SavedCard key={i} entry={entry} />
        ))}

        <Button
          style={{ marginTop: 8 }}
          label={section ? 'Back to the chapter' : 'Back to the book'}
          icon="arrow-back"
          onPress={() => goBack(section ? `/section/${section.id}` : `/book/${book.id}`)}
        />
        <Button
          variant="ghost"
          label="Run another prompt"
          onPress={() => {
            setApplied(null);
            setReply('');
          }}
        />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'AI bridge' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Body muted style={{ fontSize: 13 }}>
          Nothing leaves your phone on its own. Copy the prompt, paste it into whichever AI app you like, then bring the
          answer back here.
        </Body>

        <SectionHeading>What do you want?</SectionHeading>
        <Row style={{ flexWrap: 'wrap' }}>
          {PROMPTS.filter((p) => (section ? true : !['transcribe', 'section', 'comic', 'discuss'].includes(p.kind))).map((p) => (
            <Chip key={p.kind} label={`${p.icon} ${p.title}`} active={kind === p.kind} onPress={() => setKind(p.kind)} />
          ))}
        </Row>
        <Body muted style={{ fontSize: 13, marginTop: 8 }}>{def.blurb}</Body>

        {needsSection && !section ? (
          <Card style={{ marginTop: 12 }}>
            <Body muted>Open a chapter first — this prompt needs one.</Body>
          </Card>
        ) : null}

        {/* ---- step 1 ---- */}
        <SectionHeading>Step 1 — copy the prompt</SectionHeading>
        <Card style={{ gap: 12 }}>
          {def.attach ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="attach" size={17} color={t.accent} />
              <Body style={{ flex: 1, fontSize: 13 }}>{def.attach}</Body>
            </Row>
          ) : null}
          <Button icon={copied ? 'checkmark' : 'copy-outline'} label={copied ? 'Copied!' : 'Copy prompt'} onPress={copy} />
          <Pressable onPress={() => setShowPrompt((v) => !v)} hitSlop={6}>
            <Row gap={6}>
              <Ionicons name={showPrompt ? 'chevron-down' : 'chevron-forward'} size={15} color={t.muted} />
              <Body muted style={{ fontSize: 13 }}>{showPrompt ? 'Hide' : 'Preview'} the prompt ({prompt.length.toLocaleString()} characters)</Body>
            </Row>
          </Pressable>
          {showPrompt ? (
            <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.sm, padding: 12, maxHeight: 260 }}>
              <ScrollView nestedScrollEnabled>
                <Body selectable style={{ fontSize: 12, lineHeight: 18 }}>{prompt}</Body>
              </ScrollView>
            </View>
          ) : null}
        </Card>

        {/* ---- step 2 ---- */}
        <SectionHeading>Step 2 — paste the answer</SectionHeading>
        <Card style={{ gap: 12 }}>
          <Row gap={8}>
            <Button small variant="soft" icon="clipboard-outline" label="Paste from clipboard" onPress={pasteFromClipboard} />
            {reply ? <Button small variant="ghost" icon="close" label="Clear" onPress={() => setReply('')} /> : null}
          </Row>
          <Field
            value={reply}
            onChangeText={setReply}
            multiline
            placeholder="Paste the AI's reply here — JSON or plain text, both work."
            style={{ minHeight: 140 }}
          />

          {parsed?.ok ? (
            <View style={{ gap: 6 }}>
              <Label>{parsed.loose ? 'Plain text reply' : 'Recognised'}</Label>
              <Body muted style={{ fontSize: 13 }}>
                {parsed.loose
                  ? 'That did not come back as JSON, so it will be saved as one block of text. For the full treatment, ask the AI to reply with only the JSON object.'
                  : describeChanges(parsed.data).join(', ') || 'nothing usable — check the reply'}
              </Body>
            </View>
          ) : parsed && !parsed.ok ? (
            <Body style={{ color: t.danger, fontSize: 13 }}>{parsed.error}</Body>
          ) : null}

          {kind === 'outline' && siblings.length > 0 ? (
            <Pressable onPress={() => setReplaceChapters((v) => !v)} hitSlop={6}>
              <Row gap={8}>
                <Ionicons name={replaceChapters ? 'checkbox' : 'square-outline'} size={18} color={replaceChapters ? t.danger : t.faint} />
                <Body style={{ flex: 1, fontSize: 13 }}>
                  Replace the {siblings.length} chapters I already have (their scans and summaries are deleted)
                </Body>
              </Row>
            </Pressable>
          ) : null}

          <Button
            icon="download-outline"
            label="Apply to my journal"
            onPress={apply}
            disabled={!parsed?.ok}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- the "here is what was saved" receipt ---------- */

type Pair = { k: string; v: string };
type Saved = {
  title: string;
  /** where in the app it landed */
  where: string;
  note?: string;
  body?: string;
  items?: string[];
  pairs?: Pair[];
};

/** "3 new, 1 was already there" — merged lists only ever grow. */
function countNote(before: number, after: number, incoming: number) {
  const added = after - before;
  if (added === incoming) return undefined;
  const dupes = incoming - added;
  return added === 0
    ? `all ${incoming} were already there`
    : `${added} new, ${dupes} already there`;
}

function SavedCard({ entry }: { entry: Saved }) {
  const t = useTheme();
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 4;

  const list = entry.items ?? [];
  const pairs = entry.pairs ?? [];
  const overflow = Math.max(list.length, pairs.length) - LIMIT;
  const shownItems = showAll ? list : list.slice(0, LIMIT);
  const shownPairs = showAll ? pairs : pairs.slice(0, LIMIT);

  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{entry.title}</Label>
        <Body muted style={{ fontSize: 11 }}>{entry.where}</Body>
      </Row>

      {entry.body ? <Collapsible text={entry.body} /> : null}

      {shownItems.map((item, i) => (
        <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.accent, marginTop: 8 }} />
          <Body style={{ flex: 1, fontSize: 14 }}>{item}</Body>
        </Row>
      ))}

      {shownPairs.map((p, i) => (
        <View key={i} style={{ gap: 1 }}>
          <Body style={{ fontWeight: '700', fontSize: 14 }}>{p.k}</Body>
          {p.v ? <Body muted style={{ fontSize: 13 }}>{p.v}</Body> : null}
        </View>
      ))}

      {overflow > 0 ? (
        <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
          <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>
            {showAll ? 'Show less' : `Show ${overflow} more`}
          </Body>
        </Pressable>
      ) : null}

      {entry.note ? <Body muted style={{ fontSize: 12, fontStyle: 'italic' }}>{entry.note}</Body> : null}
    </Card>
  );
}

const merge = (existing: string[], incoming: string[]) => Array.from(new Set([...existing, ...incoming]));

function mergeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    if (!seen.has(k)) seen.set(k, item);
  }
  return Array.from(seen.values());
}
