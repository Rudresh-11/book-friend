import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, Empty, Label, Row, SectionHeading, Title } from '../../src/components/ui';
import { NARRATOR, defaultVoiceFor, scriptFor, speakersIn } from '../../src/lib/narrate';
import { listVoices, useNarrator } from '../../src/lib/useNarrator';
import { sectionLabel, sectionsOf, useLibrary } from '../../src/store';
import { radius, useTheme } from '../../src/theme';

type Voice = { identifier: string; name: string; quality?: string; language: string };

export default function ListenTab() {
  const t = useTheme();
  const state = useLibrary();
  const { updateSettings, setCastVoice } = useLibrary();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [castOpen, setCastOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const listRef = useRef<ScrollView>(null);

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
  });

  useEffect(() => {
    listVoices(state.settings.language === 'English' ? 'en' : '').then((v) => setVoices(v as Voice[]));
  }, [state.settings.language]);

  // stop talking when you leave the tab
  useFocusEffect(
    useCallback(() => {
      return () => narrator.stop();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const readable = state.sections
    .filter((s) => s.narration.length || s.pages.some((p) => p.text.trim()))
    .sort((a, b) => (b.aiUpdatedAt ?? b.createdAt) - (a.aiUpdatedAt ?? a.createdAt));

  /* ---------- nothing chosen yet: pick something to listen to ---------- */
  if (!section || !book) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {readable.length === 0 ? (
          <Empty
            icon="🎧"
            title="Nothing to read aloud yet"
            hint="Once a chapter has text — from the scanner, from typing, or from a transcription — it can be read to you here."
          />
        ) : (
          <>
            <Body muted style={{ fontSize: 13 }}>
              Read aloud by your phone's own voice. Nothing is sent anywhere, and it works offline.
            </Body>
            <SectionHeading>Chapters with text</SectionHeading>
            <View style={{ gap: 8 }}>
              {readable.map((s) => {
                const b = state.books.find((x) => x.id === s.bookId);
                const words = s.pages.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
                return (
                  <Card key={s.id} onPress={() => setSectionId(s.id)} style={{ padding: 12 }}>
                    <Row gap={12}>
                      <Ionicons name="play-circle" size={30} color={t.accent} />
                      <View style={{ flex: 1 }}>
                        <Body style={{ fontWeight: '600' }} numberOfLines={1}>
                          {sectionLabel(s)}
                        </Body>
                        <Body muted style={{ fontSize: 12 }} numberOfLines={1}>
                          {b?.title}
                          {s.narration.length ? ` · cast script, ${s.narration.length} lines` : ` · ${words} words`}
                        </Body>
                      </View>
                      {s.narration.length ? <Ionicons name="people" size={16} color={t.accent} /> : null}
                    </Row>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  /* ---------- the player ---------- */
  const line = script[narrator.index];
  const siblings = sectionsOf(state, book.id);
  const next = siblings[siblings.findIndex((s) => s.id === section.id) + 1];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => {
              narrator.stop();
              setSectionId(null);
            }}
            hitSlop={8}>
            <Row gap={6}>
              <Ionicons name="chevron-back" size={18} color={t.accent} />
              <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>All chapters</Body>
            </Row>
          </Pressable>
          <Pressable onPress={() => setCastOpen(true)} hitSlop={8}>
            <Row gap={6}>
              <Ionicons name="people-outline" size={16} color={t.accent} />
              <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>Voices</Body>
            </Row>
          </Pressable>
        </Row>
        <Title style={{ fontSize: 18 }}>{sectionLabel(section)}</Title>
        <Body muted style={{ fontSize: 12 }}>
          {book.title} · line {Math.min(narrator.index + 1, script.length)} of {script.length}
          {section.narration.length ? ' · cast script' : ' · plain reading'}
        </Body>
      </View>

      {!section.narration.length ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/ai', params: { kind: 'narrate', bookId: book.id, sectionId: section.id } })
          }
          style={{ marginHorizontal: 16, marginTop: 10 }}>
          <Card style={{ padding: 10, backgroundColor: t.accentSoft, borderColor: t.accentSoft }}>
            <Row gap={8}>
              <Ionicons name="sparkles-outline" size={16} color={t.accent} />
              <Body style={{ flex: 1, fontSize: 12 }}>
                Dialogue is being guessed from the quotation marks. Cast it with an AI for proper per-character voices
                and moods.
              </Body>
            </Row>
          </Card>
        </Pressable>
      ) : null}

      {/* the script, with the line being spoken lit up */}
      <ScrollView ref={listRef} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}>
        {script.map((l, i) => {
          const active = i === narrator.index;
          const speaker = l.speaker || NARRATOR;
          return (
            <Pressable key={i} onPress={() => narrator.jumpTo(i)}>
              <View
                style={{
                  backgroundColor: active ? t.accentSoft : 'transparent',
                  borderRadius: radius.sm,
                  padding: active ? 10 : 0,
                  paddingHorizontal: active ? 10 : 2,
                  gap: 2,
                }}>
                {speaker !== NARRATOR ? (
                  <Row gap={6}>
                    <Label style={{ color: active ? t.accent : t.muted }}>{speaker}</Label>
                    {l.mood ? (
                      <Body muted style={{ fontSize: 10, fontStyle: 'italic' }}>
                        {l.mood}
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
                  }}>
                  {l.text}
                </Body>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* controls */}
      <View style={{ borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.card, padding: 14, gap: 10 }}>
        <Row gap={14} style={{ justifyContent: 'center' }}>
          <Pressable onPress={() => narrator.jumpTo(narrator.index - 1)} hitSlop={10}>
            <Ionicons name="play-skip-back" size={26} color={t.text} />
          </Pressable>
          <Pressable
            onPress={narrator.toggle}
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: t.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name={narrator.playing ? 'pause' : 'play'} size={28} color={t.dark ? '#241A0B' : '#FFF'} />
          </Pressable>
          <Pressable onPress={() => narrator.jumpTo(narrator.index + 1)} hitSlop={10}>
            <Ionicons name="play-skip-forward" size={26} color={t.text} />
          </Pressable>
        </Row>

        <Row gap={8} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Body muted style={{ fontSize: 12 }}>Speed</Body>
          {[0.75, 0.9, 1, 1.15, 1.3].map((r) => (
            <Chip
              key={r}
              label={`${r}×`}
              active={Math.abs(state.settings.narrationRate - r) < 0.01}
              onPress={() => updateSettings({ narrationRate: r })}
            />
          ))}
        </Row>

        {next ? (
          <Button
            small
            variant="ghost"
            icon="arrow-forward"
            label={`Next: ${next.kind} ${next.number}`}
            onPress={() => {
              narrator.stop();
              setSectionId(next.id);
            }}
          />
        ) : null}
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
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, paddingBottom: 40 }}>
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
                      <Ionicons name={picking === c.name ? 'chevron-down' : 'chevron-forward'} size={15} color={t.faint} />
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
                              setCastVoice(book.id, c.name, { voice: v.identifier, pitch: c.pitch, rate: c.rate });
                              setPicking(null);
                            }}
                            style={{ paddingVertical: 8 }}>
                            <Body style={{ fontSize: 13, color: c.voice === v.identifier ? t.accent : t.text }}>
                              {v.name} {v.quality === 'Enhanced' ? '· enhanced' : ''}
                            </Body>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Body muted style={{ fontSize: 12 }}>Pitch</Body>
                    {[0.7, 0.85, 1, 1.15, 1.35].map((p) => (
                      <Chip
                        key={p}
                        label={p === 1 ? 'normal' : p < 1 ? `low ${p}` : `high ${p}`}
                        active={Math.abs(c.pitch - p) < 0.03}
                        onPress={() => setCastVoice(book.id, c.name, { voice: c.voice, pitch: p, rate: c.rate })}
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
