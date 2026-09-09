import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { radius, useTheme } from '../theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const t = useTheme();
  const body = (
    <View
      style={[
        { backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14 },
        style,
      ]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }, style]}>{children}</Text>;
}

export function Body({
  children,
  style,
  muted,
  numberOfLines,
  selectable,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[{ color: muted ? t.muted : t.text, fontSize: 15, lineHeight: 22 }, style]}>
      {children}
    </Text>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text
      style={[
        { color: t.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
        style,
      ]}>
      {children}
    </Text>
  );
}

type BtnProps = {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ label, onPress, icon, variant = 'primary', disabled, loading, style, small }: BtnProps) {
  const t = useTheme();
  const bg =
    variant === 'primary' ? t.accent : variant === 'soft' ? t.accentSoft : variant === 'danger' ? 'transparent' : 'transparent';
  const fg =
    variant === 'primary' ? (t.dark ? '#241A0B' : '#FFFFFF') : variant === 'danger' ? t.danger : variant === 'soft' ? t.accent : t.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          borderWidth: variant === 'ghost' || variant === 'danger' ? 1 : 0,
          borderColor: variant === 'danger' ? t.danger : t.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={small ? 15 : 17} color={fg} />
      ) : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        placeholderTextColor={t.faint}
        {...props}
        style={[
          {
            backgroundColor: t.card,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: t.text,
            fontSize: 15,
            lineHeight: 21,
          },
          props.multiline && { minHeight: 110, textAlignVertical: 'top' },
          style,
        ]}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: string;
}) {
  const t = useTheme();
  const color = tone ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: active ? color : t.cardAlt,
        borderWidth: 1,
        borderColor: active ? color : t.border,
        opacity: pressed ? 0.75 : 1,
      })}>
      <Text style={{ color: active ? (t.dark ? '#241A0B' : '#FFF') : t.muted, fontSize: 13, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Progress({ ratio, height = 6 }: { ratio: number; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`,
          height: '100%',
          backgroundColor: t.accent,
        }}
      />
    </View>
  );
}

/** Long text that collapses to a few lines with a "Show more" toggle. */
export function Collapsible({
  text,
  lines = 4,
  threshold = 220,
  style,
}: {
  text: string;
  lines?: number;
  threshold?: number;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;

  return (
    <View style={{ gap: 6 }}>
      <Body selectable numberOfLines={long && !open ? lines : undefined} style={style}>
        {text}
      </Body>
      {long ? (
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>
            {open ? 'Show less' : `Show more (${text.length.toLocaleString()} characters)`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A long list that shows its first few entries and hides the rest behind a
 * "Show N more" toggle — the same bargain Collapsible strikes for long text, so
 * a chapter with forty key points doesn't bury everything underneath it.
 */
export function CollapsibleList<T>({
  items,
  limit = 4,
  noun,
  gap = 10,
  wrap = false,
  renderItem,
}: {
  items: T[];
  limit?: number;
  /** what the hidden entries are called, e.g. "quote" → "Show 3 more quotes" */
  noun?: string;
  gap?: number;
  /** lay the entries out in a wrapping row instead of a column */
  wrap?: boolean;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const hidden = items.length - limit;
  const shown = open ? items : items.slice(0, limit);

  return (
    <View style={{ gap }}>
      <View
        style={{
          gap,
          flexDirection: wrap ? 'row' : 'column',
          flexWrap: wrap ? 'wrap' : 'nowrap',
        }}>
        {shown.map(renderItem)}
      </View>
      {hidden > 0 ? (
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={6}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>
            {open ? 'Show less' : `Show ${hidden} more${noun ? ` ${noun}${hidden === 1 ? '' : 's'}` : ''}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A plain drag-anywhere slider. Written by hand rather than pulled in as a
 * dependency so it behaves the same in Expo Go, in a build and on the web.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** fires all through the drag */
  onChange: (value: number) => void;
  /** fires once, when the finger lifts */
  onCommit?: (value: number) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const track = useRef<View>(null);
  const box = useRef({ x: 0, width: 0 });
  const latest = useRef(value);

  const valueAt = (pageX: number) => {
    const { x, width: w } = box.current;
    if (!w) return latest.current;
    const ratio = Math.max(0, Math.min(1, (pageX - x) / w));
    let next = min + ratio * (max - min);
    if (step) next = Math.round(next / step) * step;
    return Math.max(min, Math.min(max, Number(next.toFixed(2))));
  };

  const measure = () => track.current?.measureInWindow((x, _y, w) => (box.current = { x, width: w }));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // Absolute screen coordinates, measured against the track's own position.
        // locationX is relative to whatever child is under the finger — drag onto
        // the thumb and it resets to nearly zero, which made the handle jump.
        const next = valueAt(e.nativeEvent.pageX);
        latest.current = next;
        onChange(next);
      },
      onPanResponderMove: (e) => {
        const next = valueAt(e.nativeEvent.pageX);
        latest.current = next;
        onChange(next);
      },
      onPanResponderRelease: () => onCommit?.(latest.current),
      onPanResponderTerminate: () => onCommit?.(latest.current),
    })
  ).current;

  const ratio = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  return (
    <View
      ref={track}
      {...pan.panHandlers}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        measure();
      }}
      // generous touch target around a thin track
      style={{ height: 34, justifyContent: 'center' }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.cardAlt, overflow: 'hidden' }}>
        <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: t.accent }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(0, Math.min(width - 22, ratio * width - 11)),
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: t.accent,
          borderWidth: 2,
          borderColor: t.card,
        }}
      />
    </View>
  );
}

/** A compact "current value ▾" button that opens a short list of choices. */
export function Dropdown<T extends string | number>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  label?: string;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.cardAlt,
          opacity: pressed ? 0.75 : 1,
        })}>
        {label ? <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text> : null}
        <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>{current?.label ?? String(value)}</Text>
        <Ionicons name="chevron-down" size={13} color={t.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              backgroundColor: t.card,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: t.border,
              minWidth: 180,
              paddingVertical: 6,
            }}>
            {options.map((o) => {
              const active = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    backgroundColor: pressed ? t.cardAlt : 'transparent',
                  })}>
                  <Text style={{ color: active ? t.accent : t.text, fontSize: 15, fontWeight: active ? '700' : '500' }}>
                    {o.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={17} color={t.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 }}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {hint ? <Body muted style={{ textAlign: 'center' }}>{hint}</Body> : null}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function Row({ children, style, gap = 8 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionHeading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 10, marginTop: 22 }}>
      <Label>{children}</Label>
      {right}
    </Row>
  );
}
