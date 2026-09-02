import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLibrary } from '../store';
import { radius, useTheme } from '../theme';
import { Body, Label, Row } from './ui';

const fmt = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export function ReadingTimer({ bookId, sectionId }: { bookId: string; sectionId?: string }) {
  const t = useTheme();
  const addSession = useLibrary((s) => s.addSession);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt) {
      tick.current = setInterval(() => setNow(Date.now()), 1000);
    } else if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [startedAt]);

  const elapsed = startedAt ? now - startedAt : 0;

  const stop = () => {
    if (!startedAt) return;
    const minutes = Math.round((Date.now() - startedAt) / 60000);
    if (minutes >= 1) {
      addSession({ bookId, sectionId, startedAt, endedAt: Date.now(), minutes, pages: 0, note: '' });
    }
    setStartedAt(null);
  };

  return (
    <Pressable
      onPress={() => (startedAt ? stop() : setStartedAt(Date.now()))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        backgroundColor: startedAt ? t.accentSoft : t.card,
        borderWidth: 1,
        borderColor: startedAt ? t.accent : t.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Ionicons name={startedAt ? 'stop-circle' : 'timer-outline'} size={22} color={startedAt ? t.accent : t.muted} />
      <View style={{ flex: 1 }}>
        <Label>{startedAt ? 'Reading — tap to save' : 'Reading timer'}</Label>
        <Body style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {startedAt ? fmt(elapsed) : 'Start a session'}
        </Body>
      </View>
    </Pressable>
  );
}
