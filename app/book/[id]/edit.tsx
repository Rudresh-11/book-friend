import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Field, Row } from '../../../src/components/ui';
import { persistPhoto } from '../../../src/lib/files';
import { goBack } from '../../../src/lib/nav';
import { uid, useLibrary } from '../../../src/store';
import { radius, useTheme } from '../../../src/theme';

export default function EditBook() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const book = useLibrary((s) => s.books.find((b) => b.id === id));
  const updateBook = useLibrary((s) => s.updateBook);

  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [genre, setGenre] = useState(book?.genre ?? '');
  const [tags, setTags] = useState((book?.tags ?? []).join(', '));
  const [blurb, setBlurb] = useState(book?.blurb ?? '');
  const [notes, setNotes] = useState(book?.myNotes ?? '');
  const [storySoFar, setStorySoFar] = useState(book?.storySoFar ?? '');
  const [cover, setCover] = useState(book?.coverUri);

  if (!book) return null;

  const pickCover = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) setCover(await persistPhoto(res.assets[0].uri, `cover-${uid()}`));
  };

  const save = () => {
    updateBook(book.id, {
      title: title.trim() || book.title,
      author: author.trim(),
      genre: genre.trim(),
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      blurb: blurb.trim(),
      myNotes: notes,
      storySoFar: storySoFar.trim(),
      coverUri: cover,
    });
    goBack(`/book/${book.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
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
            <Field label="Title" value={title} onChangeText={setTitle} />
            <Field label="Author" value={author} onChangeText={setAuthor} />
          </View>
        </Row>
        <Field label="Genre" value={genre} onChangeText={setGenre} placeholder="Literary fiction" />
        <Field label="Tags" value={tags} onChangeText={setTags} placeholder="comma, separated" />
        <Field label="Blurb" value={blurb} onChangeText={setBlurb} multiline />
        <Field label="Story so far" value={storySoFar} onChangeText={setStorySoFar} multiline />
        <Field label="My notes" value={notes} onChangeText={setNotes} multiline />
        <Button label="Save" icon="checkmark" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
