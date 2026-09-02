import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Body, Card, Empty, Label, Progress, Row, SectionHeading, Title } from '../../src/components/ui';
import { minutesToday, sectionLabel, streakDays, useLibrary } from '../../src/store';
import { useTheme } from '../../src/theme';

const DAY = 86400000;

export default function Stats() {
  const t = useTheme();
  const state = useLibrary();
  const { sessions, sections, books, settings } = state;

  const streak = streakDays(sessions);
  const today = minutesToday(sessions);
  const totalMinutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const chaptersRead = sections.filter((s) => s.status === 'read').length;
  const scans = sections.reduce((n, s) => n + s.pages.length, 0);
  const finished = books.filter((b) => b.status === 'finished').length;

  const last14 = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const day = new Date(start.getTime() - (13 - i) * DAY);
      const minutes = sessions
        .filter((s) => new Date(s.endedAt).toDateString() === day.toDateString())
        .reduce((n, s) => n + s.minutes, 0);
      return { day, minutes };
    });
  }, [sessions]);

  const peak = Math.max(settings.dailyGoalMinutes, ...last14.map((d) => d.minutes), 1);
  const recent = sessions.slice(0, 12);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Row gap={10}>
        <Stat icon="flame" value={String(streak)} label={streak === 1 ? 'day streak' : 'day streak'} />
        <Stat icon="time-outline" value={`${today}m`} label="read today" />
        <Stat icon="checkmark-done" value={String(chaptersRead)} label="chapters read" />
      </Row>

      <Card style={{ marginTop: 12, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Today's goal</Label>
          <Body muted style={{ fontSize: 13 }}>{today} / {settings.dailyGoalMinutes} min</Body>
        </Row>
        <Progress ratio={today / Math.max(1, settings.dailyGoalMinutes)} height={8} />
        {today >= settings.dailyGoalMinutes ? (
          <Body style={{ color: t.good, fontSize: 13 }}>Goal met — nicely done.</Body>
        ) : (
          <Body muted style={{ fontSize: 13 }}>
            {settings.dailyGoalMinutes - today} minutes to go. Start the timer on any chapter.
          </Body>
        )}
      </Card>

      <SectionHeading>Last two weeks</SectionHeading>
      <Card>
        <Row gap={6} style={{ alignItems: 'flex-end', height: 110 }}>
          {last14.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: '100%',
                  height: Math.max(3, (d.minutes / peak) * 84),
                  borderRadius: 4,
                  backgroundColor: d.minutes ? t.accent : t.cardAlt,
                }}
              />
              <Body muted style={{ fontSize: 9 }}>
                {d.day.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Body>
            </View>
          ))}
        </Row>
        <Body muted style={{ fontSize: 12, marginTop: 10 }}>
          {totalMinutes >= 60 ? `${Math.round(totalMinutes / 60)} hours` : `${totalMinutes} minutes`} logged in total ·{' '}
          {scans} page scans · {finished} books finished
        </Body>
      </Card>

      <SectionHeading>Recent sessions</SectionHeading>
      {recent.length === 0 ? (
        <Empty icon="⏱️" title="No sessions yet" hint="Open a chapter and tap the reading timer to log your first one." />
      ) : (
        <View style={{ gap: 8 }}>
          {recent.map((s) => {
            const book = books.find((b) => b.id === s.bookId);
            const section = sections.find((x) => x.id === s.sectionId);
            return (
              <Card key={s.id} style={{ padding: 12 }} onPress={section ? () => router.push(`/section/${section.id}`) : undefined}>
                <Row gap={10}>
                  <Ionicons name="book-outline" size={17} color={t.faint} />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '600' }} numberOfLines={1}>{book?.title ?? 'Deleted book'}</Body>
                    <Body muted style={{ fontSize: 12 }}>
                      {section ? `${sectionLabel(section)} · ` : ''}
                      {new Date(s.endedAt).toLocaleDateString()}
                    </Body>
                  </View>
                  <Body style={{ fontWeight: '700', color: t.accent }}>{s.minutes}m</Body>
                </Row>
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ icon, value, label }: { icon: any; value: string; label: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 16 }}>
      <Ionicons name={icon} size={20} color={t.accent} />
      <Title style={{ fontSize: 22 }}>{value}</Title>
      <Body muted style={{ fontSize: 11, textAlign: 'center' }}>{label}</Body>
    </Card>
  );
}
