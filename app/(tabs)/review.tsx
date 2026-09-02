import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Empty, Label, Progress, Row, Title } from '../../src/components/ui';
import { dueCards, sectionLabel, useLibrary } from '../../src/store';
import { useTheme } from '../../src/theme';

export default function Review() {
  const t = useTheme();
  const state = useLibrary();
  const gradeCard = useLibrary((s) => s.gradeCard);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  const due = useMemo(() => dueCards(state), [state.sections]);
  const total = state.sections.reduce((n, s) => n + s.cards.length, 0);
  const current = due[0];

  if (!total) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Empty
          icon="🎴"
          title="No review cards yet"
          hint="Open a chapter, run the “Review cards” prompt through your AI app of choice, and paste the answer back. Cards land here on a spaced-repetition schedule."
        />
      </ScrollView>
    );
  }

  if (!current) {
    const soonest = state.sections
      .flatMap((s) => s.cards)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Empty
          icon="✅"
          title={done ? `${done} cards reviewed` : 'Nothing due right now'}
          hint={
            soonest
              ? `Next card comes back ${new Date(soonest.dueAt).toLocaleDateString()}. ${total} cards in rotation.`
              : undefined
          }
        />
      </ScrollView>
    );
  }

  const book = state.books.find((b) => b.id === current.section.bookId);

  const grade = (g: 0 | 1 | 2) => {
    gradeCard(current.section.id, current.card.id, g);
    setRevealed(false);
    setDone((n) => n + 1);
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>{due.length} due</Label>
          <Label>{done} done today</Label>
        </Row>
        <Progress ratio={done / Math.max(1, done + due.length)} />
      </View>

      <Pressable style={{ flex: 1 }} onPress={() => setRevealed(true)}>
        <Card style={{ flex: 1, justifyContent: 'center', gap: 20, padding: 22 }}>
          <View style={{ gap: 6 }}>
            <Label>
              {book?.title ?? 'Book'} · {sectionLabel(current.section)}
            </Label>
            <Title style={{ fontSize: 21, lineHeight: 29 }}>{current.card.q}</Title>
          </View>

          {revealed ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 18 }}>
              <Label>Answer</Label>
              <Body style={{ fontSize: 17, lineHeight: 25 }}>{current.card.a || '(no answer was given)'}</Body>
            </View>
          ) : (
            <Row gap={8} style={{ justifyContent: 'center', opacity: 0.6 }}>
              <Ionicons name="eye-outline" size={17} color={t.muted} />
              <Body muted>Tap to reveal</Body>
            </Row>
          )}
        </Card>
      </Pressable>

      {revealed ? (
        <Row gap={8}>
          <Button style={{ flex: 1 }} variant="ghost" label="Again" onPress={() => grade(0)} />
          <Button style={{ flex: 1 }} variant="soft" label="Good" onPress={() => grade(1)} />
          <Button style={{ flex: 1 }} label="Easy" onPress={() => grade(2)} />
        </Row>
      ) : (
        <Row gap={8}>
          <Button style={{ flex: 1 }} variant="ghost" label="Open chapter" icon="book-outline" onPress={() => router.push(`/section/${current.section.id}`)} />
          <Button style={{ flex: 1 }} label="Reveal" icon="eye-outline" onPress={() => setRevealed(true)} />
        </Row>
      )}
    </View>
  );
}
