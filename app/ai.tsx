import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, Field, Label, Row, SectionHeading, Title } from '../src/components/ui';
import { goBack } from '../src/lib/nav';
import { describeChanges, parseAiResponse, type AiPayload } from '../src/lib/parse';
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
  const [applied, setApplied] = useState<string[] | null>(null);
  const [replaceChapters, setReplaceChapters] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const book = state.books.find((b) => b.id === params.bookId);
  const section = state.sections.find((s) => s.id === params.sectionId);
  const siblings = book ? sectionsOf(state, book.id) : [];
  const previous = section ? siblings.filter((s) => s.order < section.order) : siblings.filter((s) => s.status === 'read');

  const def = PROMPTS.find((p) => p.kind === kind)!;
  const needsSection = kind === 'section' || kind === 'cards' || kind === 'discuss' || kind === 'transcribe';

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
    await Clipboard.setStringAsync(prompt);
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
    const changes = describeChanges(d);

    /* ---- book-level fields ---- */
    const bookPatch: Record<string, unknown> = {};
    if (kind === 'outline') {
      if (d.title) bookPatch.title = d.title;
      if (d.author) bookPatch.author = d.author;
      if (d.genre) bookPatch.genre = d.genre;
      if (d.blurb) bookPatch.blurb = d.blurb;
      if (d.tags?.length) bookPatch.tags = Array.from(new Set([...book.tags, ...d.tags]));
      if (d.totalPages) bookPatch.totalPages = d.totalPages;
    }
    if (d.storySoFar) bookPatch.storySoFar = d.storySoFar;
    if (kind === 'recap' && !section && d.recap) bookPatch.storySoFar = book.storySoFar || d.recap;
    if (Object.keys(bookPatch).length) store.updateBook(book.id, bookPatch as any);

    /* ---- chapters from an outline ---- */
    if (kind === 'outline' && d.sections?.length) {
      if (replaceChapters) siblings.forEach((s) => store.removeSection(s.id));
      store.addSections(
        book.id,
        d.sections.map((s) => ({
          kind: (s.kind as SectionKind) || state.settings.defaultKind,
          number: s.number ?? '',
          title: s.title ?? '',
        }))
      );
    }

    /* ---- transcription lands on the page scans ---- */
    if (kind === 'transcribe' && section && d.pages?.length) {
      const untouched = [...section.pages];
      d.pages.forEach((p, i) => {
        const byLabel = p.label ? untouched.find((x) => x.label === p.label) : undefined;
        const target = byLabel ?? untouched.find((x) => !x.text.trim()) ?? untouched[i];
        if (!target) return;
        store.updatePage(section.id, target.id, { text: p.text, textSource: 'ai', label: target.label || p.label || '' });
        const idx = untouched.indexOf(target);
        if (idx >= 0) untouched.splice(idx, 1);
      });
    }

    /* ---- everything else lands on the chapter ---- */
    if (section && kind !== 'transcribe') {
      const patch: Record<string, unknown> = { aiUpdatedAt: Date.now() };
      if (d.title && !section.title) patch.title = d.title;
      if (d.recap) patch.recap = d.recap;
      if (d.summary) patch.summary = d.summary;
      if (d.mood) patch.mood = d.mood;
      if (d.difficulty) patch.difficulty = d.difficulty;
      if (d.keyPoints?.length) patch.keyPoints = merge(section.keyPoints, d.keyPoints);
      if (d.themes?.length) patch.themes = merge(section.themes, d.themes);
      if (d.characters?.length)
        patch.characters = mergeBy([...section.characters, ...d.characters.map((c) => ({ name: c.name, note: c.note ?? '' }))], (c) => c.name);
      if (d.quotes?.length)
        patch.quotes = mergeBy([...section.quotes, ...d.quotes.map((q) => ({ text: q.text, page: q.page, note: q.note }))], (q) => q.text);
      if (d.vocabulary?.length)
        patch.vocabulary = mergeBy([...section.vocabulary, ...d.vocabulary.map((v) => ({ word: v.word, meaning: v.meaning ?? '' }))], (v) => v.word.toLowerCase());
      if (d.notes) patch.myNotes = [section.myNotes, d.notes].filter(Boolean).join('\n\n');
      store.updateSection(section.id, patch as any);
      if (d.cards?.length) store.addCards(section.id, d.cards.map((c) => ({ q: c.q, a: c.a ?? '' })));
    } else if (!section && d.recap && kind === 'recap') {
      // a book-level recap is kept on the book itself
      store.updateBook(book.id, { storySoFar: d.recap });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setApplied(changes.length ? changes : ['nothing recognisable']);
  };

  /* ---------- applied confirmation ---------- */
  if (applied) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Stack.Screen options={{ title: 'Updated' }} />
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <Ionicons name="checkmark-circle" size={56} color={t.good} />
          <Title style={{ textAlign: 'center' }}>Saved to your journal</Title>
          <Body muted style={{ textAlign: 'center' }}>Updated: {applied.join(', ')}.</Body>
        </View>
        <Button
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
          {PROMPTS.filter((p) => (section ? true : !['transcribe', 'section', 'cards', 'discuss'].includes(p.kind))).map((p) => (
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
