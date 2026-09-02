import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { ReadingTimer } from '../../../src/components/ReadingTimer';
import { Body, Button, Card, Chip, Field, Label, Row, SectionHeading, Title } from '../../../src/components/ui';
import { goBack } from '../../../src/lib/nav';
import { wordCount } from '../../../src/lib/ocr';
import { sectionText } from '../../../src/lib/prompts';
import { sectionLabel, sectionsOf, useLibrary } from '../../../src/store';
import { radius, useTheme } from '../../../src/theme';
import type { SectionKind } from '../../../src/types';

const KINDS: SectionKind[] = ['Chapter', 'Part', 'Section', 'Episode', 'Canto', 'Act', 'Lesson', 'Entry'];

export default function SectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const state = useLibrary();
  const section = state.sections.find((s) => s.id === id);
  const { updateSection, removeSection, reorderSection } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(section?.myNotes ?? '');

  if (!section) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body muted>That chapter is gone.</Body>
      </View>
    );
  }

  const book = state.books.find((b) => b.id === section.bookId);
  const siblings = sectionsOf(state, section.bookId);
  const index = siblings.findIndex((s) => s.id === section.id);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  const text = sectionText(section);
  const words = wordCount(text);
  const done = section.status === 'read';

  const goAi = (kind: string) =>
    router.push({ pathname: '/ai', params: { kind, bookId: section.bookId, sectionId: section.id } });

  const confirmDelete = () =>
    Alert.alert('Delete this chapter?', 'Its scans and summary go with it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const target = section.bookId;
          removeSection(section.id);
          goBack(`/book/${target}`);
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: book?.title ?? '',
          headerTitleStyle: { fontSize: 15, fontWeight: '600' },
          headerRight: () => (
            <Row gap={16}>
              <Pressable onPress={() => setEditing((v) => !v)} hitSlop={8}>
                <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={22} color={t.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={21} color={t.danger} />
              </Pressable>
            </Row>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {editing ? (
          <Card style={{ gap: 12 }}>
            <Row style={{ flexWrap: 'wrap' }}>
              {KINDS.map((k) => (
                <Chip key={k} label={k} active={section.kind === k} onPress={() => updateSection(section.id, { kind: k })} />
              ))}
            </Row>
            <Row gap={10}>
              <View style={{ width: 90 }}>
                <Field label="Number" value={section.number} onChangeText={(v) => updateSection(section.id, { number: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Title"
                  value={section.title}
                  onChangeText={(v) => updateSection(section.id, { title: v })}
                  placeholder="optional"
                />
              </View>
            </Row>
            <Row gap={10}>
              <View style={{ flex: 1 }}>
                <Field
                  label="First page"
                  value={section.startPage ?? ''}
                  onChangeText={(v) => updateSection(section.id, { startPage: v })}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Last page"
                  value={section.endPage ?? ''}
                  onChangeText={(v) => updateSection(section.id, { endPage: v })}
                  keyboardType="number-pad"
                />
              </View>
            </Row>
            <Row gap={8}>
              <Button small variant="ghost" icon="arrow-up" label="Move up" onPress={() => reorderSection(section.id, -1)} />
              <Button small variant="ghost" icon="arrow-down" label="Move down" onPress={() => reorderSection(section.id, 1)} />
            </Row>
          </Card>
        ) : (
          <Title>{sectionLabel(section)}</Title>
        )}

        <Row gap={8} style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <Chip
            label={done ? '✓ Read' : 'Mark as read'}
            active={done}
            tone={t.good}
            onPress={() =>
              updateSection(section.id, { status: done ? 'unread' : 'read', readAt: done ? undefined : Date.now() })
            }
          />
          <Chip
            label="Reading now"
            active={section.status === 'reading'}
            onPress={() => updateSection(section.id, { status: section.status === 'reading' ? 'unread' : 'reading' })}
          />
        </Row>

        <View style={{ marginTop: 12 }}>
          <ReadingTimer bookId={section.bookId} sectionId={section.id} />
        </View>

        {/* --- scans --- */}
        <SectionHeading
          right={
            <Pressable onPress={() => router.push(`/section/${section.id}/scan`)} hitSlop={6}>
              <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>
                {section.pages.length ? 'Manage' : 'Add photos'}
              </Body>
            </Pressable>
          }>
          Page scans {section.pages.length ? `(${section.pages.length})` : ''}
        </SectionHeading>

        {section.pages.length === 0 ? (
          <Card onPress={() => router.push(`/section/${section.id}/scan`)}>
            <Row gap={12}>
              <Ionicons name="camera-outline" size={26} color={t.accent} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>Photograph the pages</Body>
                <Body muted style={{ fontSize: 13 }}>
                  One shot can hold a two-page spread. Text is pulled out on the phone.
                </Body>
              </View>
            </Row>
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {section.pages.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/section/${section.id}/scan`)}>
                  <Image
                    source={{ uri: p.uri }}
                    style={{ width: 84, height: 112, borderRadius: radius.sm, backgroundColor: t.cardAlt }}
                    contentFit="cover"
                  />
                  <Body muted style={{ fontSize: 11, marginTop: 4 }}>
                    {p.label || '—'} {p.text ? '· text' : ''}
                  </Body>
                </Pressable>
              ))}
            </ScrollView>
            {words > 0 ? (
              <Body muted style={{ fontSize: 12, marginTop: 8 }}>
                {words.toLocaleString()} words captured across {section.pages.filter((p) => p.text.trim()).length} scans
              </Body>
            ) : (
              <Body muted style={{ fontSize: 12, marginTop: 8 }}>
                No text extracted yet — open the scans to run text recognition.
              </Body>
            )}
          </>
        )}

        {/* --- AI bridge --- */}
        <SectionHeading>Ask another AI</SectionHeading>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Button small icon="sparkles-outline" label="Summarise" onPress={() => goAi('section')} />
          <Button small variant="soft" icon="albums-outline" label="Review cards" onPress={() => goAi('cards')} />
          <Button small variant="soft" icon="search-outline" label="Go deeper" onPress={() => goAi('discuss')} />
          <Button small variant="soft" icon="play-back-outline" label="Recap" onPress={() => goAi('recap')} />
        </Row>
        {section.aiUpdatedAt ? (
          <Body muted style={{ fontSize: 12, marginTop: 8 }}>
            Last updated from an AI answer on {new Date(section.aiUpdatedAt).toLocaleDateString()}
          </Body>
        ) : null}

        {section.recap ? (
          <>
            <SectionHeading>Recap</SectionHeading>
            <Card style={{ backgroundColor: t.accentSoft, borderColor: t.accentSoft }}>
              <Body selectable>{section.recap}</Body>
            </Card>
          </>
        ) : null}

        {section.summary ? (
          <>
            <SectionHeading>Summary</SectionHeading>
            <Card>
              <Body selectable>{section.summary}</Body>
              {section.mood || section.difficulty ? (
                <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
                  {section.mood ? <Chip label={section.mood} /> : null}
                  {section.difficulty ? <Chip label={`difficulty ${section.difficulty}/5`} /> : null}
                </Row>
              ) : null}
            </Card>
          </>
        ) : null}

        {section.keyPoints.length ? (
          <>
            <SectionHeading>Key points</SectionHeading>
            <Card style={{ gap: 10 }}>
              {section.keyPoints.map((p, i) => (
                <Row key={i} gap={10} style={{ alignItems: 'flex-start' }}>
                  <Body style={{ color: t.accent, fontWeight: '700' }}>{i + 1}</Body>
                  <Body style={{ flex: 1 }} selectable>{p}</Body>
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {section.characters.length ? (
          <>
            <SectionHeading>Who's who</SectionHeading>
            <Card style={{ gap: 12 }}>
              {section.characters.map((c, i) => (
                <View key={i}>
                  <Body style={{ fontWeight: '700' }}>{c.name}</Body>
                  {c.note ? <Body muted style={{ fontSize: 14 }}>{c.note}</Body> : null}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {section.quotes.length ? (
          <>
            <SectionHeading>Lines worth keeping</SectionHeading>
            <View style={{ gap: 8 }}>
              {section.quotes.map((q, i) => (
                <Card key={i} style={{ borderLeftWidth: 3, borderLeftColor: t.accent }}>
                  <Body selectable style={{ fontStyle: 'italic' }}>“{q.text}”</Body>
                  {q.page ? <Body muted style={{ fontSize: 12, marginTop: 6 }}>p. {q.page}</Body> : null}
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {section.vocabulary.length ? (
          <>
            <SectionHeading>Words</SectionHeading>
            <Card style={{ gap: 10 }}>
              {section.vocabulary.map((v, i) => (
                <View key={i}>
                  <Body style={{ fontWeight: '700' }}>{v.word}</Body>
                  <Body muted style={{ fontSize: 14 }}>{v.meaning}</Body>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {section.themes.length ? (
          <>
            <SectionHeading>Themes</SectionHeading>
            <Row style={{ flexWrap: 'wrap' }}>
              {section.themes.map((th) => (
                <Chip key={th} label={th} />
              ))}
            </Row>
          </>
        ) : null}

        {section.cards.length ? (
          <>
            <SectionHeading>Review cards</SectionHeading>
            <Card onPress={() => router.push('/review')}>
              <Row gap={12}>
                <Ionicons name="albums-outline" size={22} color={t.accent} />
                <Body style={{ flex: 1 }}>
                  {section.cards.length} cards from this chapter ·{' '}
                  {section.cards.filter((c) => c.dueAt <= Date.now()).length} due now
                </Body>
                <Ionicons name="chevron-forward" size={18} color={t.faint} />
              </Row>
            </Card>
          </>
        ) : null}

        <SectionHeading>My notes</SectionHeading>
        <Field
          value={notes}
          onChangeText={setNotes}
          onBlur={() => updateSection(section.id, { myNotes: notes })}
          multiline
          placeholder="What you thought, questions you had, where you stopped…"
        />

        <Row gap={8} style={{ marginTop: 24, justifyContent: 'space-between' }}>
          {prev ? (
            <Button small variant="ghost" icon="chevron-back" label={`${prev.kind} ${prev.number}`} onPress={() => router.replace(`/section/${prev.id}`)} />
          ) : (
            <View />
          )}
          {next ? (
            <Button small variant="ghost" label={`${next.kind} ${next.number}`} onPress={() => router.replace(`/section/${next.id}`)} />
          ) : (
            <View />
          )}
        </Row>
      </ScrollView>
    </>
  );
}
