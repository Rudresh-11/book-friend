import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Chip, Field, Label, Row } from '../../src/components/ui';
import { persistPhoto } from '../../src/lib/files';
import { uid, useLibrary } from '../../src/store';
import { radius, useTheme } from '../../src/theme';
import type { BookStatus, SectionKind } from '../../src/types';

const STATUSES: { key: BookStatus; label: string }[] = [
  { key: 'reading', label: 'Reading now' },
  { key: 'want', label: 'Want to read' },
  { key: 'paused', label: 'Paused' },
  { key: 'finished', label: 'Finished' },
];

const KINDS: SectionKind[] = ['Chapter', 'Part', 'Section', 'Episode', 'Lesson'];

export default function NewBook() {
  const t = useTheme();
  const addBook = useLibrary((s) => s.addBook);
  const addSections = useLibrary((s) => s.addSections);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<BookStatus>('reading');
  const [cover, setCover] = useState<string | undefined>();
  const [kind, setKind] = useState<SectionKind>('Chapter');
  const [count, setCount] = useState('');

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) setCover(await persistPhoto(res.assets[0].uri, `cover-${uid()}`, 'cover'));
  };

  const save = () => {
    if (!title.trim()) return;
    const id = addBook({ title, author, status, coverUri: cover });
    const n = Math.min(200, Math.max(0, parseInt(count, 10) || 0));
    if (n > 0) {
      addSections(
        id,
        Array.from({ length: n }, (_, i) => ({ kind, number: String(i + 1), title: '' }))
      );
    }
    router.replace(`/book/${id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Row gap={14} style={{ alignItems: 'flex-start' }}>
          <Pressable
            onPress={pickCover}
            style={{
              width: 84,
              height: 120,
              borderRadius: radius.md,
              backgroundColor: t.cardAlt,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
            {cover ? (
              <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Body muted style={{ fontSize: 12, textAlign: 'center' }}>Add{'\n'}cover</Body>
            )}
          </Pressable>
          <View style={{ flex: 1, gap: 12 }}>
            <Field label="Title" value={title} onChangeText={setTitle} placeholder="The book's name" autoFocus />
            <Field label="Author" value={author} onChangeText={setAuthor} placeholder="Who wrote it" />
          </View>
        </Row>

        <View style={{ gap: 8 }}>
          <Label>Status</Label>
          <Row style={{ flexWrap: 'wrap' }}>
            {STATUSES.map((s) => (
              <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => setStatus(s.key)} />
            ))}
          </Row>
        </View>

        <View style={{ gap: 8 }}>
          <Label>Structure</Label>
          <Body muted style={{ fontSize: 13 }}>
            What does this book call its pieces, and how many are there? Leave the count blank to add them one at a
            time later — or let the AI bridge outline the book for you.
          </Body>
          <Row style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </Row>
          <Field
            label={`How many ${kind.toLowerCase()}s?`}
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            placeholder="e.g. 24"
          />
        </View>

        <Button label="Add to shelf" icon="checkmark" onPress={save} disabled={!title.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
