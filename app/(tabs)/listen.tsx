import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Body,
  Button,
  Card,
  Chip,
  Dropdown,
  Empty,
  Label,
  Row,
  SectionHeading,
  Slider,
  Title,
} from '../../src/components/ui';
import { NARRATOR, defaultVoiceFor, scriptFor, speakersIn } from '../../src/lib/narrate';
import { listVoices, useNarrator } from '../../src/lib/useNarrator';
import { sectionLabel, sectionsOf, useLibrary } from '../../src/store';
import { radius, useTheme } from '../../src/theme';

type Voice = {
  identifier: string;
  name: string;
  quality?: string;
  language: string;
};

const hasText = (s: { narration: unknown[]; pages: { text: string }[] }) =>
  s.narration.length > 0 || s.pages.some((p) => p.text.trim());

/** The only speeds worth having, as a short list rather than a fiddly slider. */
const SPEEDS = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
];

const STATUS_LABEL: Record<string, string> = {
  reading: 'Reading',
  paused: 'Paused',
  want: 'Want to read',
  finished: 'Finished',
  abandoned: 'Set aside',
};

export default function ListenTab() {
  const t = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const state = useLibrary();
  const { updateSettings, setCastVoice } = useLibrary();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [castOpen, setCastOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [focus, setFocus] = useState(false);
  const [muted, setMuted] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  /** the line the seek bar is being dragged to, before the finger lifts */
  const [scrub, setScrub] = useState<number | null>(null);
  const listRef = useRef<ScrollView>(null);
  /** where each line sits in the scroll content, and how tall the window is */
  const offsets = useRef<number[]>([]);
  const viewportH = useRef(0);
  const measuredFor = useRef<string | null>(null);

  const section = state.sections.find((s) => s.id === sectionId);
  const book = section ? state.books.find((b) => b.id === section.bookId) : undefined;

  const script = useMemo(() => (section ? scriptFor(section) : []), [section]);
  const speakers = useMemo(() => speakersIn(script), [script]);

  const cast = useMemo(() => {
    if (!book) return [];
    // anyone without a saved voice gets a distinguishable default
    return speakers.map((name, i) => {
      const saved = book.cast.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return saved ?? defaultVoiceFor(name, i);
    });
  }, [book, speakers]);

  const narrator = useNarrator(script, {
    cast,
    rate: state.settings.narrationRate,
    pitch: state.settings.narrationPitch,
    narratorVoice: state.settings.narratorVoice,
    volume: muted ? 0 : 1,
  });

  /**
   * The line already being spoken keeps the volume it started with, so muting
   * mid-sentence would not be heard until the next line. Restarting the current
   * line applies it straight away — silently when muting, and re-reading the
   * line you were on when unmuting.
   */
  useEffect(() => {
    if (narrator.playing) narrator.play(narrator.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  useEffect(() => {
    listVoices(state.settings.language === 'English' ? 'en' : '').then((v) => setVoices(v as Voice[]));
  }, [state.settings.language]);

  // stop talking when you leave the tab
  useFocusEffect(
    useCallback(() => {
      return () => narrator.stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  /**
   * Keep the current line on screen: as the reading moves on, when play is
   * pressed, and after a seek — so you never have to hunt for where the voice
   * actually is. The line settles a third of the way down, leaving the words
   * coming next in view.
   */
  useEffect(() => {
    const y = offsets.current[narrator.index];
    if (y == null) return;
    listRef.current?.scrollTo({
      y: Math.max(0, y - viewportH.current * 0.35),
      animated: true,
    });
  }, [narrator.index, narrator.playing]);

  // A different chapter means last chapter's measurements are meaningless. This
  // has to happen during render: as an effect it ran *after* the layout pass and
  // wiped the very offsets that pass had just measured, so nothing ever scrolled.
  if (measuredFor.current !== sectionId) {
    measuredFor.current = sectionId;
    offsets.current = [];
  }

  /**
   * Focus hands the whole screen to the words: the "Listen" header and the tab
   * bar at the bottom both go, leaving the text and the player. Both belong to
   * the navigator rather than this screen, so they are turned off through it —
   * and turned back on whenever focus ends or the screen goes away.
   */
  useEffect(() => {
    navigation.setOptions({
      headerShown: !focus,
      tabBarStyle: focus ? { display: 'none' } : { backgroundColor: t.card, borderTopColor: t.border },
    });
    return () => {
      navigation.setOptions({
        headerShown: true,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
      });
    };
  }, [focus, navigation, t.card, t.border]);

  /**
   * The list follows where you actually are, rather than dumping every chapter
   * that happens to have text: books you are reading come first (most recently
   * opened first), then paused, then the rest, and inside each book the chapters
   * stay in reading order with the one you are on marked.
   */
  const STATUS_RANK: Record<string, number> = {
    reading: 0,
    paused: 1,
    want: 2,
    finished: 3,
    abandoned: 4,
  };

  const shelves = useMemo(() => {
    return state.books
      .map((b) => {
        const all = sectionsOf(state, b.id);
        // where you are in this book, whether or not that chapter has text yet
        const current = all.find((s) => s.status === 'reading') ?? all.find((s) => s.status !== 'read');
        // the chapter you are on always shows, even with nothing to read yet —
        // hiding it was why "reading now" could be missing from this list entirely
        const chapters = all.filter((s) => hasText(s) || s.id === current?.id);
        return { book: b, chapters, currentId: current?.id };
      })
      .filter((shelf) => shelf.chapters.length > 0)
      .sort((a, b) => {
        const rank = (STATUS_RANK[a.book.status] ?? 9) - (STATUS_RANK[b.book.status] ?? 9);
        return rank !== 0 ? rank : (b.book.lastOpenedAt ?? 0) - (a.book.lastOpenedAt ?? 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.books, state.sections]);

  /** The one chapter to offer up front: where you are in the book you last opened. */
  const carryOn = shelves
    .filter((shelf) => shelf.book.status === 'reading' || shelf.book.status === 'paused')
    .flatMap((shelf) => {
      const chapter = shelf.chapters.find((s) => s.id === shelf.currentId);
      return chapter ? [{ book: shelf.book, chapter }] : [];
    })[0];

  /** Play it if there is anything to read; otherwise send them off to get the text. */
  const open = (s: (typeof state.sections)[number]) =>
    hasText(s) ? setSectionId(s.id) : router.push(`/section/${s.id}/scan`);

  /* ---------- nothing chosen yet: pick something to listen to ---------- */
  if (!section || !book) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {shelves.length === 0 ? (
          <Empty
            icon="🎧"
            title="Nothing to read aloud yet"
            hint="Once a chapter has text — from the scanner, from typing, or from a transcription — it can be read to you here."
          />
        ) : (
          <>
            <Body muted style={{ fontSize: 13 }}>
              Read aloud by your phone's own voice — offline, nothing uploaded. The book you're reading comes first, and
              the chapter you're on is marked.
            </Body>

            {carryOn ? (
              <>
                <SectionHeading>Carry on where you are</SectionHeading>
                <Card
                  onPress={() => open(carryOn.chapter)}
                  style={{
                    backgroundColor: t.accentSoft,
                    borderColor: t.accentSoft,
                  }}
                >
                  <Row gap={12}>
                    <Ionicons
                      name={hasText(carryOn.chapter) ? 'play-circle' : 'camera-outline'}
                      size={34}
                      color={t.accent}
                    />
                    <View style={{ flex: 1 }}>
                      <Body style={{ fontWeight: '700' }} numberOfLines={1}>
                        {sectionLabel(carryOn.chapter)}
                      </Body>
                      <Body muted style={{ fontSize: 12 }} numberOfLines={2}>
                        {carryOn.book.title} ·{' '}
                        {carryOn.chapter.status === 'reading' ? 'the chapter you’re on' : 'next one up'}
                        {hasText(carryOn.chapter) ? '' : ' · no text yet, tap to add the pages'}
                      </Body>
                    </View>
                  </Row>
                </Card>
              </>
            ) : null}

            {shelves.map((shelf) => (
              <View key={shelf.book.id}>
                <SectionHeading
                  right={
                    <Chip
                      label={STATUS_LABEL[shelf.book.status] ?? shelf.book.status}
                      active={shelf.book.status === 'reading'}
                    />
                  }
                >
                  {shelf.book.title}
                </SectionHeading>
                <View style={{ gap: 8 }}>
                  {shelf.chapters.map((s) => {
                    const words = s.pages.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
                    const isCurrent = s.id === shelf.currentId;
                    const done = s.status === 'read';
                    const readable = hasText(s);
                    return (
                      <Card
                        key={s.id}
                        onPress={() => open(s)}
                        style={{
                          padding: 12,
                          borderColor: isCurrent ? t.accent : t.border,
                          opacity: done && !isCurrent ? 0.7 : 1,
                        }}
                      >
                        <Row gap={12}>
                          <Ionicons
                            name={!readable ? 'camera-outline' : done ? 'checkmark-circle' : 'play-circle'}
                            size={30}
                            color={!readable ? t.faint : done ? t.good : t.accent}
                          />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Row gap={8}>
                              <Body style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                                {sectionLabel(s)}
                              </Body>
                              {isCurrent ? (
                                <Body
                                  style={{
                                    color: t.accent,
                                    fontSize: 11,
                                    fontWeight: '700',
                                  }}
                                >
                                  {s.status === 'reading' ? 'READING NOW' : 'UP NEXT'}
                                </Body>
                              ) : done ? (
                                <Body muted style={{ fontSize: 11 }}>
                                  read
                                </Body>
                              ) : null}
                            </Row>
                            <Body muted style={{ fontSize: 12 }} numberOfLines={1}>
                              {!readable
                                ? 'no text yet — tap to photograph or type the pages'
                                : s.narration.length
                                  ? `cast script · ${s.narration.length} lines`
                                  : `${words} words`}
                            </Body>
                          </View>
                          {s.narration.length ? <Ionicons name="people" size={16} color={t.accent} /> : null}
                        </Row>
                      </Card>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  /* ---------- the player ---------- */
  const siblings = sectionsOf(state, book.id);
  const here = siblings.findIndex((s) => s.id === section.id);
  const prev = siblings[here - 1];
  const next = siblings[here + 1];
  const rate = state.settings.narrationRate;
  const seekAt = scrub ?? narrator.index;
  // the page the current line came off, so you know where the voice has got to
  const page = script[narrator.index]?.page;

  return (
    <View style={{ flex: 1, paddingTop: focus ? insets.top : 0 }}>
      {focus ? null : (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => {
                narrator.stop();
                setSectionId(null);
              }}
              hitSlop={8}
            >
              <Row gap={6}>
                <Ionicons name="chevron-back" size={18} color={t.accent} />
                <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>All chapters</Body>
              </Row>
            </Pressable>
            <Row gap={18}>
              <Pressable onPress={() => setFocus(true)} hitSlop={8}>
                <Row gap={6}>
                  <Ionicons name="expand-outline" size={16} color={t.accent} />
                  <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>Focus</Body>
                </Row>
              </Pressable>
              <Pressable onPress={() => setCastOpen(true)} hitSlop={8}>
                <Row gap={6}>
                  <Ionicons name="people-outline" size={16} color={t.accent} />
                  <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>Voices</Body>
                </Row>
              </Pressable>
            </Row>
          </Row>

          <Row gap={8} style={{ justifyContent: 'space-between' }}>
            <Title style={{ flex: 1, fontSize: 18 }}>{sectionLabel(section)}</Title>
            {page ? (
              <View
                style={{
                  backgroundColor: t.accentSoft,
                  borderRadius: radius.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Body style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>p. {page}</Body>
              </View>
            ) : null}
          </Row>
          <Body muted style={{ fontSize: 12 }}>
            {book.title} · line {Math.min(narrator.index + 1, script.length)} of {script.length}
            {section.narration.length ? ' · cast script' : ' · plain reading'}
          </Body>
        </View>
      )}

      {!section.narration.length && !focus && !state.settings.castHintOff ? (
        <View style={{ marginHorizontal: 16, marginTop: 10 }}>
          <Card
            style={{
              padding: 10,
              backgroundColor: t.accentSoft,
              borderColor: t.accentSoft,
            }}
          >
            <Row gap={8} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="sparkles-outline" size={16} color={t.accent} style={{ marginTop: 2 }} />
              <Pressable
                style={{ flex: 1 }}
                onPress={() =>
                  router.push({
                    pathname: '/ai',
                    params: {
                      kind: 'narrate',
                      bookId: book.id,
                      sectionId: section.id,
                    },
                  })
                }
              >
                <Body style={{ fontSize: 12 }}>
                  Dialogue is being guessed from the quotation marks. Cast it with an AI for proper per-character voices
                  and moods.
                </Body>
              </Pressable>
              <Pressable onPress={() => updateSettings({ castHintOff: true })} hitSlop={10}>
                <Ionicons name="close" size={16} color={t.muted} />
              </Pressable>
            </Row>
          </Card>
        </View>
      ) : null}

      {/* the script, with the line being spoken lit up */}
      <ScrollView
        ref={listRef}
        onLayout={(e) => (viewportH.current = e.nativeEvent.layout.height)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
      >
        {script.map((l, i) => {
          const active = i === narrator.index;
          const speaker = l.speaker || NARRATOR;
          return (
            // the measuring wrapper is a plain View: it is the direct child of the
            // scroll content, so its y is the offset to scroll to, and onLayout is
            // reliable on it in a way it is not on a Pressable
            <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}>
              <Pressable onPress={() => narrator.jumpTo(i)}>
                <View
                  style={{
                    backgroundColor: active ? t.accentSoft : 'transparent',
                    borderRadius: radius.sm,
                    padding: active ? 10 : 0,
                    paddingHorizontal: active ? 10 : 2,
                    gap: 2,
                  }}
                >
                  {speaker !== NARRATOR || (active && l.page) ? (
                    <Row gap={6}>
                      {speaker !== NARRATOR ? (
                        <Label style={{ color: active ? t.accent : t.muted }}>{speaker}</Label>
                      ) : null}
                      {l.mood ? (
                        <Body muted style={{ fontSize: 10, fontStyle: 'italic' }}>
                          {l.mood}
                        </Body>
                      ) : null}
                      {active && l.page ? (
                        <Body muted style={{ fontSize: 10, marginLeft: 'auto' }}>
                          p. {l.page}
                        </Body>
                      ) : null}
                    </Row>
                  ) : null}
                  <Body
                    style={{
                      fontSize: 15,
                      opacity: active ? 1 : 0.55,
                      fontWeight: active ? '600' : '400',
                      fontStyle: speaker === NARRATOR ? 'normal' : 'italic',
                    }}
                  >
                    {l.text}
                  </Body>
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* controls — collapse to a single slim bar when the words matter more */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: t.border,
          backgroundColor: t.card,
          paddingHorizontal: 14,
          paddingTop: minimized ? 6 : 12,
          // the tab bar is gone in focus, so take over its safe area
          paddingBottom: (minimized ? 6 : 12) + (focus ? insets.bottom : 0),
          gap: minimized ? 0 : 8,
        }}
      >
        {minimized ? (
          <Row gap={12}>
            <Pressable onPress={narrator.toggle} hitSlop={8}>
              <Ionicons name={narrator.playing ? 'pause-circle' : 'play-circle'} size={38} color={t.accent} />
            </Pressable>
            <Pressable onPress={() => narrator.jumpTo(narrator.index + 1)} hitSlop={8}>
              <Ionicons name="play-skip-forward" size={20} color={t.muted} />
            </Pressable>
            <Body muted style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>
              {page ? `p. ${page} · ` : ''}
              {Math.min(narrator.index + 1, script.length)}/{script.length} ·{' '}
              {SPEEDS.find((s) => s.value === rate)?.label ?? `${rate}×`}
              {muted ? ' · muted' : ''}
            </Body>
            <Pressable onPress={() => setMuted((m) => !m)} hitSlop={10}>
              <Ionicons
                name={muted ? 'volume-mute' : 'volume-medium-outline'}
                size={19}
                color={muted ? t.accent : t.muted}
              />
            </Pressable>
            <Pressable onPress={() => setFocus((f) => !f)} hitSlop={10}>
              <Ionicons
                name={focus ? 'contract-outline' : 'expand-outline'}
                size={19}
                color={focus ? t.accent : t.muted}
              />
            </Pressable>
            <Pressable onPress={() => setMinimized(false)} hitSlop={10}>
              <Ionicons name="chevron-up" size={20} color={t.muted} />
            </Pressable>
          </Row>
        ) : (
          <>
            {focus ? (
              <Row gap={8}>
                <Body muted style={{ flex: 1, fontSize: 11 }} numberOfLines={1}>
                  {sectionLabel(section)} · line {Math.min(narrator.index + 1, script.length)} of {script.length}
                </Body>
                {page ? <Body style={{ color: t.accent, fontSize: 11, fontWeight: '700' }}>p. {page}</Body> : null}
              </Row>
            ) : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <Dropdown label="Speed" value={rate} options={SPEEDS} onChange={(v) => updateSettings({ narrationRate: v })} />
              <Row gap={14}>
                <Pressable onPress={() => narrator.jumpTo(narrator.index - 1)} hitSlop={10}>
                  <Ionicons name="play-skip-back" size={26} color={t.text} />
                </Pressable>
                <Pressable
                  onPress={narrator.toggle}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: t.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={narrator.playing ? 'pause' : 'play'} size={27} color={t.dark ? '#241A0B' : '#FFF'} />
                </Pressable>
                <Pressable onPress={() => narrator.jumpTo(narrator.index + 1)} hitSlop={10}>
                  <Ionicons name="play-skip-forward" size={26} color={t.text} />
                </Pressable>
              </Row>
              <Row gap={14}>
                <Pressable onPress={() => setMuted((m) => !m)} hitSlop={10}>
                  <Ionicons
                    name={muted ? 'volume-mute' : 'volume-medium-outline'}
                    size={21}
                    color={muted ? t.accent : t.muted}
                  />
                </Pressable>
                <Pressable onPress={() => setFocus((f) => !f)} hitSlop={10}>
                  <Ionicons
                    name={focus ? 'contract-outline' : 'expand-outline'}
                    size={21}
                    color={focus ? t.accent : t.muted}
                  />
                </Pressable>
                <Pressable onPress={() => setMinimized(true)} hitSlop={10}>
                  <Ionicons name="chevron-down" size={22} color={t.muted} />
                </Pressable>
              </Row>
            </Row>

            {/* seek through the chapter — the line only changes when you let go,
                so it doesn't restart the voice on every pixel of the drag */}
            <Row gap={10}>
              <View style={{ flex: 1 }}>
                <Slider
                  value={seekAt}
                  min={0}
                  max={Math.max(0, script.length - 1)}
                  step={1}
                  onChange={setScrub}
                  onCommit={(v) => {
                    setScrub(null);
                    narrator.jumpTo(v);
                  }}
                />
              </View>
              <Body muted style={{ fontSize: 12, minWidth: 80, textAlign: 'right' }} numberOfLines={1}>
                {scrub !== null && script[scrub]?.page ? `p. ${script[scrub]?.page} · ` : ''}
                {Math.min(seekAt + 1, script.length)}/{script.length}
              </Body>
            </Row>

            {prev || next ? (
              <Row gap={8}>
                {prev ? (
                  <Button
                    small
                    variant="ghost"
                    icon="chevron-back"
                    label={`${prev.kind} ${prev.number}`}
                    style={{ flex: 1 }}
                    onPress={() => {
                      narrator.stop();
                      setSectionId(prev.id);
                    }}
                  />
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                {next ? (
                  <Button
                    small
                    variant="ghost"
                    icon="arrow-forward"
                    label={`${next.kind} ${next.number}`}
                    style={{ flex: 1 }}
                    onPress={() => {
                      narrator.stop();
                      setSectionId(next.id);
                    }}
                  />
                ) : (
                  <View style={{ flex: 1 }} />
                )}
              </Row>
            ) : null}
          </>
        )}
      </View>

      {/* who sounds like what */}
      <Modal visible={castOpen} animationType="slide" onRequestClose={() => setCastOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ padding: 16, gap: 6 }}>
            <Title>Voices</Title>
            <Body muted style={{ fontSize: 13 }}>
              {voices.length
                ? 'Give each character one of the voices installed on this phone. Pitch is nudged automatically so two characters never sound the same.'
                : 'No voices found on this device. Android: install Google Text-to-Speech and a voice pack in Settings → Accessibility.'}
            </Body>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingTop: 0,
              gap: 10,
              paddingBottom: 40,
            }}
          >
            {cast.map((c) => {
              const chosen = voices.find((v) => v.identifier === c.voice);
              return (
                <Card key={c.name} style={{ gap: 8 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Label>{c.name}</Label>
                    <Body muted style={{ fontSize: 11 }}>
                      pitch {c.pitch.toFixed(2)} · {c.rate.toFixed(2)}×
                    </Body>
                  </Row>
                  <Pressable onPress={() => setPicking(picking === c.name ? null : c.name)}>
                    <Row gap={8}>
                      <Ionicons name="mic-outline" size={16} color={t.accent} />
                      <Body style={{ flex: 1, fontSize: 13 }}>{chosen?.name ?? 'Default voice'}</Body>
                      <Ionicons
                        name={picking === c.name ? 'chevron-down' : 'chevron-forward'}
                        size={15}
                        color={t.faint}
                      />
                    </Row>
                  </Pressable>

                  {picking === c.name ? (
                    <View style={{ maxHeight: 190 }}>
                      <ScrollView nestedScrollEnabled>
                        {voices.map((v) => (
                          <Pressable
                            key={v.identifier}
                            onPress={() => {
                              if (c.name === NARRATOR) updateSettings({ narratorVoice: v.identifier });
                              setCastVoice(book.id, c.name, {
                                voice: v.identifier,
                                pitch: c.pitch,
                                rate: c.rate,
                              });
                              setPicking(null);
                            }}
                            style={{ paddingVertical: 8 }}
                          >
                            <Body
                              style={{
                                fontSize: 13,
                                color: c.voice === v.identifier ? t.accent : t.text,
                              }}
                            >
                              {v.name} {v.quality === 'Enhanced' ? '· enhanced' : ''}
                            </Body>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Body muted style={{ fontSize: 12 }}>
                      Pitch
                    </Body>
                    {[0.7, 0.85, 1, 1.15, 1.35].map((p) => (
                      <Chip
                        key={p}
                        label={p === 1 ? 'normal' : p < 1 ? `low ${p}` : `high ${p}`}
                        active={Math.abs(c.pitch - p) < 0.03}
                        onPress={() =>
                          setCastVoice(book.id, c.name, {
                            voice: c.voice,
                            pitch: p,
                            rate: c.rate,
                          })
                        }
                      />
                    ))}
                  </Row>
                </Card>
              );
            })}
          </ScrollView>
          <View style={{ padding: 16 }}>
            <Button label="Done" icon="checkmark" onPress={() => setCastOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
