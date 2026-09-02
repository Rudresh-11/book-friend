import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Field, Label, Row, Title } from '../../../src/components/ui';
import { deletePhoto, persistPhoto } from '../../../src/lib/files';
import { isOcrAvailable, recognizeText, wordCount } from '../../../src/lib/ocr';
import { sectionLabel, uid, useLibrary } from '../../../src/store';
import { radius, useTheme } from '../../../src/theme';
import type { PageShot } from '../../../src/types';

export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const section = useLibrary((s) => s.sections.find((x) => x.id === id));
  const { addPage, updatePage, removePage } = useLibrary();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PageShot | null>(null);
  const [editingText, setEditingText] = useState<PageShot | null>(null);
  const [draft, setDraft] = useState('');
  const ocrReady = isOcrAvailable();

  if (!section) return null;

  const nextLabel = () => {
    const last = [...section.pages].reverse().find((p) => /\d/.test(p.label));
    if (!last) return '';
    const nums = last.label.match(/\d+/g)?.map(Number) ?? [];
    if (!nums.length) return '';
    const highest = Math.max(...nums);
    return last.spread ? `${highest + 1}-${highest + 2}` : String(highest + 1);
  };

  const capture = async (from: 'camera' | 'library') => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Camera permission needed', 'Allow camera access to photograph pages.');
      }
      const res =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, allowsMultipleSelection: true });
      if (res.canceled || !res.assets?.length) return;

      let label = nextLabel();
      for (const asset of res.assets) {
        const pid = uid();
        const uri = persistPhoto(asset.uri, pid);
        const spread = !!asset.width && !!asset.height && asset.width > asset.height;
        addPage(section.id, {
          uri,
          label,
          spread,
          text: '',
          textSource: 'none',
          width: asset.width,
          height: asset.height,
        });
        if (label) {
          const nums = label.match(/\d+/g)?.map(Number) ?? [];
          const highest = Math.max(...nums);
          label = spread ? `${highest + 1}-${highest + 2}` : String(highest + 1);
        }
      }
    } catch (e: any) {
      Alert.alert('Could not add that photo', e?.message ?? 'Unknown error');
    }
  };

  const runOcr = async (page: PageShot) => {
    setBusy(page.id);
    const res = await recognizeText(page.uri);
    setBusy(null);
    if (res.ok) {
      updatePage(section.id, page.id, { text: res.text, textSource: 'ocr' });
    } else {
      Alert.alert(res.reason === 'unavailable' ? 'Scanning not available here' : 'Nothing readable', res.message);
    }
  };

  const runOcrAll = async () => {
    const pending = section.pages.filter((p) => !p.text.trim());
    if (!pending.length) return;
    for (const page of pending) {
      setBusy(page.id);
      const res = await recognizeText(page.uri);
      if (res.ok) updatePage(section.id, page.id, { text: res.text, textSource: 'ocr' });
      else if (res.reason === 'unavailable') {
        setBusy(null);
        return Alert.alert('Scanning not available here', res.message);
      }
    }
    setBusy(null);
  };

  const confirmRemove = (page: PageShot) =>
    Alert.alert('Remove this scan?', 'The photo and its text are deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deletePhoto(page.uri);
          removePage(section.id, page.id);
        },
      },
    ]);

  const withText = section.pages.filter((p) => p.text.trim()).length;
  const totalWords = section.pages.reduce((n, p) => n + wordCount(p.text), 0);

  return (
    <>
      <Stack.Screen options={{ title: sectionLabel(section) }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Row gap={10}>
          <Button style={{ flex: 1 }} icon="camera" label="Take photo" onPress={() => capture('camera')} />
          <Button style={{ flex: 1 }} variant="soft" icon="images-outline" label="From gallery" onPress={() => capture('library')} />
        </Row>

        {section.pages.length > 0 ? (
          <Card style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Label>Text extraction</Label>
                <Body muted style={{ fontSize: 13 }}>
                  {withText}/{section.pages.length} scans have text
                  {totalWords ? ` · ${totalWords.toLocaleString()} words` : ''}
                </Body>
              </View>
              <Ionicons name={ocrReady ? 'flash' : 'flash-off-outline'} size={20} color={ocrReady ? t.accent : t.faint} />
            </Row>
            {ocrReady ? (
              <Button
                small
                variant="soft"
                icon="scan-outline"
                label="Extract text from all new scans"
                onPress={runOcrAll}
                disabled={!!busy || withText === section.pages.length}
              />
            ) : (
              <>
                <Body muted style={{ fontSize: 13 }}>
                  On-device scanning needs a development build. Until then, send the photos to another AI app and paste
                  the transcript back.
                </Body>
                <Button
                  small
                  variant="soft"
                  icon="sparkles-outline"
                  label="Transcribe with AI"
                  onPress={() =>
                    router.push({
                      pathname: '/ai',
                      params: { kind: 'transcribe', bookId: section.bookId, sectionId: section.id },
                    })
                  }
                />
              </>
            )}
          </Card>
        ) : null}

        {section.pages.length === 0 ? (
          <Card>
            <Body muted>
              No scans yet. Photograph the pages as you read — hold the phone above an open book and one shot can catch
              both pages at once.
            </Body>
          </Card>
        ) : null}

        {section.pages.map((page, i) => (
          <Card key={page.id} style={{ gap: 10 }}>
            <Row gap={12} style={{ alignItems: 'flex-start' }}>
              <Pressable onPress={() => setViewing(page)}>
                <Image
                  source={{ uri: page.uri }}
                  style={{ width: 76, height: 100, borderRadius: radius.sm, backgroundColor: t.cardAlt }}
                  contentFit="cover"
                />
              </Pressable>
              <View style={{ flex: 1, gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label>Scan {i + 1}</Label>
                  <Pressable onPress={() => confirmRemove(page)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={17} color={t.danger} />
                  </Pressable>
                </Row>
                <Field
                  value={page.label}
                  onChangeText={(v) => updatePage(section.id, page.id, { label: v })}
                  placeholder="page number, e.g. 12-13"
                  style={{ paddingVertical: 8 }}
                />
                <Pressable onPress={() => updatePage(section.id, page.id, { spread: !page.spread })} hitSlop={6}>
                  <Row gap={6}>
                    <Ionicons
                      name={page.spread ? 'checkbox' : 'square-outline'}
                      size={17}
                      color={page.spread ? t.accent : t.faint}
                    />
                    <Body muted style={{ fontSize: 13 }}>Two pages in this photo</Body>
                  </Row>
                </Pressable>
              </View>
            </Row>

            {page.text ? (
              <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.sm, padding: 10, gap: 8 }}>
                <Body numberOfLines={4} style={{ fontSize: 13, lineHeight: 19 }}>{page.text}</Body>
                <Row gap={8}>
                  <Button
                    small
                    variant="ghost"
                    icon="create-outline"
                    label="Edit text"
                    onPress={() => {
                      setEditingText(page);
                      setDraft(page.text);
                    }}
                  />
                  <Button
                    small
                    variant="ghost"
                    icon="copy-outline"
                    label="Copy"
                    onPress={() => Clipboard.setStringAsync(page.text)}
                  />
                  <Body muted style={{ fontSize: 12, marginLeft: 'auto' }}>
                    {wordCount(page.text)} words · {page.textSource}
                  </Body>
                </Row>
              </View>
            ) : (
              <Row gap={8}>
                <Button
                  small
                  variant="soft"
                  icon="scan-outline"
                  label={busy === page.id ? 'Reading…' : 'Extract text'}
                  loading={busy === page.id}
                  onPress={() => runOcr(page)}
                />
                <Button
                  small
                  variant="ghost"
                  icon="create-outline"
                  label="Type it"
                  onPress={() => {
                    setEditingText(page);
                    setDraft('');
                  }}
                />
              </Row>
            )}
          </Card>
        ))}
      </ScrollView>

      {/* full-size viewer */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {viewing ? (
            <Image source={{ uri: viewing.uri }} style={{ width: '100%', height: '85%' }} contentFit="contain" />
          ) : null}
          <Body style={{ color: '#FFF', marginTop: 12 }}>Tap anywhere to close</Body>
        </Pressable>
      </Modal>

      {/* text editor */}
      <Modal visible={!!editingText} animationType="slide" onRequestClose={() => setEditingText(null)}>
        <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}>
          <Title>Page text</Title>
          <Body muted style={{ fontSize: 13 }}>
            Fix anything the scanner misread — this text is what the AI prompts are built from.
          </Body>
          <Field value={draft} onChangeText={setDraft} multiline style={{ flex: 1, minHeight: 200 }} autoFocus />
          <Row gap={10}>
            <Button style={{ flex: 1 }} variant="ghost" label="Cancel" onPress={() => setEditingText(null)} />
            <Button
              style={{ flex: 1 }}
              icon="checkmark"
              label="Save"
              onPress={() => {
                if (editingText) {
                  updatePage(section.id, editingText.id, {
                    text: draft,
                    textSource: draft.trim() ? 'manual' : 'none',
                  });
                }
                setEditingText(null);
              }}
            />
          </Row>
        </View>
      </Modal>
    </>
  );
}
