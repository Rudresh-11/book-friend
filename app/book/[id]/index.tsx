import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, Divider, Label, Progress, Row, SectionHeading, Title } from '../../../src/components/ui';
import { bookProgress, sectionLabel, sectionsOf, useLibrary } from '../../../src/store';
import { radius, useTheme } from '../../../src/theme';
import type { BookStatus, Section } from '../../../src/types';

const STATUSES: { key: BookStatus; label: string }[] = [
  { key: 'want', label: 'Want' },
  { key: 'reading', label: 'Reading' },
  { key: 'paused', label: 'Paused' },
  { key: 'finished', label: 'Finished' },
  { key: 'abandoned', label: 'Set aside' },
];

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const state = useLibrary();
  const book = state.books.find((b) => b.id === id);
  const { touchBook, setBookStatus, addSection, removeBook, updateBook } = useLibrary();

  useEffect(() => {
    if (book) touchBook(book.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!book) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Body muted>That book is gone.</Body>
      </View>
    );
  }

  const sections = sectionsOf(state, book.id);
  const progress = bookProgress(state, book.id);
  const next = sections.find((s) => s.status !== 'read');
  const readSections = sections.filter((s) => s.status === 'read');

  const confirmDelete = () =>
    Alert.alert('Delete this book?', 'Its chapters, scans and summaries go with it. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeBook(book.id);
          router.replace('/');
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Row gap={16}>
              <Pressable onPress={() => router.push(`/book/${book.id}/edit`)} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={t.text} />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={21} color={t.danger} />
              </Pressable>
            </Row>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Row gap={14} style={{ alignItems: 'flex-start' }}>
          <View
            style={{
              width: 92,
              height: 134,
              borderRadius: radius.md,
              backgroundColor: t.cardAlt,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {book.coverUri ? (
              <Image source={{ uri: book.coverUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Ionicons name="book-outline" size={30} color={t.faint} />
            )}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Title>{book.title}</Title>
            {book.author ? <Body muted>{book.author}</Body> : null}
            <Row gap={4}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => updateBook(book.id, { rating: book.rating === n ? 0 : n })} hitSlop={4}>
                  <Ionicons name={n <= book.rating ? 'star' : 'star-outline'} size={18} color={t.accent} />
                </Pressable>
              ))}
            </Row>
            {sections.length > 0 ? (
              <View style={{ gap: 5 }}>
                <Progress ratio={progress.ratio} />
                <Body muted style={{ fontSize: 12 }}>
                  {progress.read} of {progress.total} {sections[0].kind.toLowerCase()}s read
                </Body>
              </View>
            ) : null}
          </View>
        </Row>

        <Row style={{ flexWrap: 'wrap', marginTop: 16 }}>
          {STATUSES.map((s) => (
            <Chip key={s.key} label={s.label} active={book.status === s.key} onPress={() => setBookStatus(book.id, s.key)} />
          ))}
        </Row>

        {book.blurb ? (
          <Card style={{ marginTop: 16 }}>
            <Label>Blurb</Label>
            <Body style={{ marginTop: 6 }}>{book.blurb}</Body>
          </Card>
        ) : null}

        {book.tags.length ? (
          <Row style={{ flexWrap: 'wrap', marginTop: 12 }}>
            {book.tags.map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </Row>
        ) : null}

        {/* --- jump back in --- */}
        <SectionHeading>Pick it back up</SectionHeading>
        <Card>
          {book.storySoFar ? (
            <>
              <Label>Story so far</Label>
              <Body style={{ marginTop: 6 }}>{book.storySoFar}</Body>
              <Divider />
            </>
          ) : (
            <Body muted style={{ marginBottom: 12 }}>
              {readSections.length
                ? 'Build a running summary of everything you have read so far.'
                : 'Once you have summarised a chapter or two, a running summary can be woven from them.'}
            </Body>
          )}
          <Row gap={8} style={{ flexWrap: 'wrap', marginTop: book.storySoFar ? 12 : 0 }}>
            <Button
              small
              variant="soft"
              icon="play-back-outline"
              label="Recap for me"
              onPress={() => router.push({ pathname: '/ai', params: { kind: 'recap', bookId: book.id } })}
            />
            <Button
              small
              variant="soft"
              icon="git-merge-outline"
              label={book.storySoFar ? 'Refresh story so far' : 'Story so far'}
              onPress={() => router.push({ pathname: '/ai', params: { kind: 'storySoFar', bookId: book.id } })}
            />
            {next ? (
              <Button
                small
                icon="arrow-forward"
                label={`Continue: ${next.kind} ${next.number}`}
                onPress={() => router.push(`/section/${next.id}`)}
              />
            ) : null}
          </Row>
        </Card>

        {/* --- chapters --- */}
        <SectionHeading
          right={
            <Row gap={12}>
              <Pressable
                onPress={() => router.push({ pathname: '/ai', params: { kind: 'outline', bookId: book.id } })}
                hitSlop={6}>
                <Body style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>Outline with AI</Body>
              </Pressable>
              <Pressable onPress={() => addSection(book.id)} hitSlop={6}>
                <Ionicons name="add-circle-outline" size={20} color={t.accent} />
              </Pressable>
            </Row>
          }>
          {sections.length ? `${sections[0].kind}s` : 'Chapters'}
        </SectionHeading>

        {sections.length === 0 ? (
          <Card>
            <Body muted>
              No chapters yet. Add them one by one with +, or let another AI outline the book and paste the answer
              back in.
            </Body>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {sections.map((s) => (
              <SectionRow key={s.id} section={s} />
            ))}
          </View>
        )}

        {book.myNotes ? (
          <>
            <SectionHeading>My notes</SectionHeading>
            <Card>
              <Body>{book.myNotes}</Body>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function SectionRow({ section }: { section: Section }) {
  const t = useTheme();
  const updateSection = useLibrary((s) => s.updateSection);
  const done = section.status === 'read';
  const scans = section.pages.length;
  const hasText = section.pages.some((p) => p.text.trim());

  return (
    <Card onPress={() => router.push(`/section/${section.id}`)} style={{ padding: 12 }}>
      <Row gap={12}>
        <Pressable
          hitSlop={8}
          onPress={() =>
            updateSection(section.id, {
              status: done ? 'unread' : 'read',
              readAt: done ? undefined : Date.now(),
            })
          }>
          <Ionicons
            name={done ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={done ? t.good : t.faint}
          />
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <Body style={{ fontWeight: '600', opacity: done ? 0.65 : 1 }} numberOfLines={1}>
            {sectionLabel(section)}
          </Body>
          <Row gap={10}>
            {scans ? (
              <Row gap={3}>
                <Ionicons name="images-outline" size={12} color={t.faint} />
                <Body muted style={{ fontSize: 12 }}>{scans}</Body>
              </Row>
            ) : null}
            {hasText ? <Ionicons name="text-outline" size={12} color={t.faint} /> : null}
            {section.summary ? <Ionicons name="sparkles-outline" size={12} color={t.accent} /> : null}
            {section.cards.length ? (
              <Row gap={3}>
                <Ionicons name="albums-outline" size={12} color={t.faint} />
                <Body muted style={{ fontSize: 12 }}>{section.cards.length}</Body>
              </Row>
            ) : null}
            {!scans && !section.summary ? <Body muted style={{ fontSize: 12 }}>empty</Body> : null}
          </Row>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.faint} />
      </Row>
    </Card>
  );
}
