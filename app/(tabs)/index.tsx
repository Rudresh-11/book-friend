import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Body, Card, Chip, Empty, Label, Progress, Row, Title } from '../../src/components/ui';
import { bookProgress, sectionsOf, useLibrary } from '../../src/store';
import { radius, useTheme } from '../../src/theme';
import type { Book, BookStatus } from '../../src/types';

const FILTERS: { key: BookStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'want', label: 'Want to read' },
  { key: 'paused', label: 'Paused' },
  { key: 'finished', label: 'Finished' },
];

export default function Library() {
  const t = useTheme();
  const state = useLibrary();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BookStatus | 'all'>('all');

  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.books
      .filter((b) => (filter === 'all' ? true : b.status === filter))
      .filter(
        (b) =>
          !q ||
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.tags.some((tag) => tag.toLowerCase().includes(q))
      )
      .sort((a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt));
  }, [state.books, query, filter]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: t.card,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: radius.pill,
                paddingHorizontal: 14,
              }}>
              <Ionicons name="search" size={17} color={t.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search title, author or tag"
                placeholderTextColor={t.faint}
                style={{ flex: 1, paddingVertical: 11, color: t.text, fontSize: 15 }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={t.faint} />
                </Pressable>
              ) : null}
            </View>
            <Row style={{ flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
              ))}
            </Row>
          </View>
        }
        renderItem={({ item }) => <BookRow book={item} />}
        ListEmptyComponent={
          state.books.length === 0 ? (
            <Empty
              icon="📚"
              title="Your shelf is empty"
              hint="Add the book you're reading, then photograph its pages as you go."
            />
          ) : (
            <Empty icon="🔍" title="Nothing matches" hint="Try another search or filter." />
          )
        }
      />

      <Pressable
        onPress={() => router.push('/book/new')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 20,
          bottom: 24,
          height: 56,
          paddingHorizontal: 20,
          borderRadius: radius.pill,
          backgroundColor: t.accent,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          opacity: pressed ? 0.8 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        })}>
        <Ionicons name="add" size={22} color={t.dark ? '#241A0B' : '#FFF'} />
        <Body style={{ color: t.dark ? '#241A0B' : '#FFF', fontWeight: '700' }}>Add book</Body>
      </Pressable>
    </View>
  );
}

const STATUS_LABEL: Record<BookStatus, string> = {
  want: 'Want to read',
  reading: 'Reading',
  paused: 'Paused',
  finished: 'Finished',
  abandoned: 'Set aside',
};

function BookRow({ book }: { book: Book }) {
  const t = useTheme();
  const state = useLibrary();
  const progress = bookProgress(state, book.id);
  const sections = sectionsOf(state, book.id);
  const next = sections.find((s) => s.status !== 'read');
  const pageCount = sections.reduce((n, s) => n + s.pages.length, 0);

  return (
    <Card onPress={() => router.push(`/book/${book.id}`)} style={{ padding: 12 }}>
      <Row style={{ alignItems: 'flex-start' }} gap={12}>
        <View
          style={{
            width: 60,
            height: 88,
            borderRadius: radius.sm,
            backgroundColor: t.cardAlt,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {book.coverUri ? (
            <Image source={{ uri: book.coverUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Ionicons name="book-outline" size={24} color={t.faint} />
          )}
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <Title style={{ fontSize: 17 }} >{book.title}</Title>
          {book.author ? <Body muted numberOfLines={1} style={{ fontSize: 13 }}>{book.author}</Body> : null}

          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Label style={{ color: book.status === 'reading' ? t.accent : t.faint }}>{STATUS_LABEL[book.status]}</Label>
            {pageCount > 0 ? <Label style={{ color: t.faint }}>· {pageCount} scans</Label> : null}
          </Row>

          {sections.length > 0 ? (
            <View style={{ gap: 5, marginTop: 2 }}>
              <Progress ratio={progress.ratio} />
              <Body muted style={{ fontSize: 12 }}>
                {progress.read}/{progress.total} done
                {next ? ` · next: ${next.kind} ${next.number}` : ' · finished every chapter'}
              </Body>
            </View>
          ) : (
            <Body muted style={{ fontSize: 12 }}>No chapters yet — tap to set them up</Body>
          )}
        </View>
      </Row>
    </Card>
  );
}
