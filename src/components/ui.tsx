import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
