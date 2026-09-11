import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Collapsible, Field, Label, Row, Title } from '../../../src/components/ui';
import { notify } from '../../../src/lib/alert';
import { copyText } from '../../../src/lib/clipboard';
import { deletePhoto, persistPhoto } from '../../../src/lib/files';
import { sectionLabel, uid, useLibrary } from '../../../src/store';
import { radius, useTheme } from '../../../src/theme';
import type { ComicPanel, ComicSheet } from '../../../src/types';

export default function ComicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const section = useLibrary((s) => s.sections.find((x) => x.id === id));
  const { addPanels, updatePanel, removePanel, addComicSheet, removeComicSheet } = useLibrary();
  const [viewing, setViewing] = useState<ComicPanel | null>(null);
  const [viewingSheet, setViewingSheet] = useState<ComicSheet | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<ComicPanel | null>(null);
  const [draft, setDraft] = useState('');

  if (!section) return null;

  const drawn = section.comic.filter((p) => p.uri).length;

  const copyPrompt = async (panel: ComicPanel) => {
    if (!(await copyText(panel.prompt || panel.scene))) return;
    setCopied(panel.id);
    setTimeout(() => setCopied(null), 2000);
  };

  /**
   * Handing an image AI every prompt at once gets you one comic page with all the
   * panels on it, not N separate pictures — so ask for exactly that, and say how
   * to lay it out. The single picture comes back as a "comic page" below.
   */
  const copyAll = async () => {
    const n = section.comic.length;
    const across = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const brief = [
      `Draw all ${n} of these scenes as ONE comic page image.`,
      `Lay them out as a grid ${across} panels across, in this order, left to right and top to bottom, and number each panel.`,
      `Put that panel's caption in a box across the top of it.`,
      `Keep one art style throughout, and draw each character the same way every time they appear.`,
      '',
      ...section.comic.map((p, i) => `Panel ${i + 1}. Caption: ${p.scene}\n${p.prompt || p.scene}`),
    ].join('\n');
    if (!(await copyText(brief))) return;
    setCopied('all');
    setTimeout(() => setCopied(null), 2000);
  };

  /** Save the one-picture version of the whole comic. */
  const addSheet = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const uri = await persistPhoto(asset.uri, `sheet-${uid()}`, 'art');
      addComicSheet(section.id, { uri, width: asset.width, height: asset.height });
    } catch (e: any) {
      notify('Could not add that comic page', e?.message ?? 'Unknown error');
    }
  };

  const confirmRemoveSheet = (sheet: ComicSheet) =>
    notify('Remove this comic page?', 'The picture is deleted. The scenes and their prompts stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deletePhoto(sheet.uri);
          removeComicSheet(section.id, sheet.id);
        },
      },
    ]);

  /** Put a picture on one panel. */
  const pickFor = async (panel: ComicPanel) => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets?.[0]) return;
      const uri = await persistPhoto(res.assets[0].uri, `panel-${uid()}`, 'art');
      const old = panel.uri;
      updatePanel(section.id, panel.id, { uri });
      if (old && old !== uri) deletePhoto(old);
    } catch (e: any) {
      notify('Could not add that picture', e?.message ?? 'Unknown error');
    }
  };

  /** Generate several at once, then drop them onto the empty panels in order. */
  const fillEmpty = async () => {
    const empty = section.comic.filter((p) => !p.uri);
    if (!empty.length) return notify('Every panel already has a picture', 'Tap a panel to swap its picture instead.');
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: empty.length,
      });
      if (res.canceled || !res.assets?.length) return;
      for (let i = 0; i < res.assets.length && i < empty.length; i++) {
        const uri = await persistPhoto(res.assets[i].uri, `panel-${uid()}`, 'art');
        updatePanel(section.id, empty[i].id, { uri });
      }
    } catch (e: any) {
      notify('Could not add those pictures', e?.message ?? 'Unknown error');
    }
  };

  const confirmRemove = (panel: ComicPanel, index: number) =>
    notify(`Remove panel ${index + 1}?`, 'Its picture and scene go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (panel.uri) deletePhoto(panel.uri);
          removePanel(section.id, panel.id);
        },
      },
    ]);

  const addBlank = () => addPanels(section.id, [{ scene: 'New scene', prompt: '' }]);

  const goAi = () =>
    router.push({ pathname: '/ai', params: { kind: 'comic', bookId: section.bookId, sectionId: section.id } });

  return (
    <>
      <Stack.Screen options={{ title: `Comic · ${sectionLabel(section)}` }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled">
        {section.comic.length === 0 ? (
          <Card style={{ gap: 12 }}>
            <Row gap={12}>
              <Ionicons name="color-palette-outline" size={26} color={t.accent} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>No panels yet</Body>
                <Body muted style={{ fontSize: 13 }}>
                  Ask an AI to break this chapter into scenes. Each scene comes back with an image prompt you can paste
                  into an image generator, then save the picture here.
                </Body>
              </View>
            </Row>
            <Button icon="sparkles-outline" label="Break it into scenes" onPress={goAi} />
            <Button variant="ghost" icon="add" label="Or add a scene myself" onPress={addBlank} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <Label>The comic</Label>
                  <Body muted style={{ fontSize: 13 }}>
                    {section.comic.length} scenes ·{' '}
                    {section.comicSheets.length
                      ? `${section.comicSheets.length} whole ${section.comicSheets.length === 1 ? 'page' : 'pages'}`
                      : `${drawn} panels drawn`}
                  </Body>
                </View>
                <Ionicons
                  name={section.comicSheets.length || drawn === section.comic.length ? 'checkmark-circle' : 'brush-outline'}
                  size={20}
                  color={section.comicSheets.length || drawn === section.comic.length ? t.good : t.faint}
                />
              </Row>

              <View style={{ gap: 6 }}>
                <Label>One picture for the whole chapter</Label>
                <Body muted style={{ fontSize: 13 }}>
                  Copy the whole-page brief, paste it into an image AI, and it draws every scene onto a single comic
                  page. Save that picture here.
                </Body>
                <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 4 }}>
                  <Button
                    small
                    icon={copied === 'all' ? 'checkmark' : 'copy-outline'}
                    label={copied === 'all' ? 'Copied!' : 'Copy whole-page brief'}
                    onPress={copyAll}
                  />
                  <Button small variant="soft" icon="newspaper-outline" label="Add the comic page" onPress={addSheet} />
                </Row>
              </View>

              <View style={{ gap: 6, marginTop: 4 }}>
                <Label>Or one picture per panel</Label>
                <Body muted style={{ fontSize: 13 }}>
                  Copy a single panel's prompt instead, then drop its picture onto that panel below.
                </Body>
                <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 4 }}>
                  <Button small variant="soft" icon="images-outline" label="Fill empty panels" onPress={fillEmpty} />
                </Row>
              </View>
            </Card>

            {section.comicSheets.map((sheet, i) => (
              <Card key={sheet.id} style={{ gap: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label>Comic page {section.comicSheets.length > 1 ? i + 1 : ''}</Label>
                  <Pressable onPress={() => confirmRemoveSheet(sheet)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={17} color={t.danger} />
                  </Pressable>
                </Row>
                <Pressable onPress={() => setViewingSheet(sheet)}>
                  <Image
                    source={{ uri: sheet.uri }}
                    style={{
                      width: '100%',
                      // a whole page is wider than it is tall; use its real shape when we know it
                      aspectRatio: sheet.width && sheet.height ? sheet.width / sheet.height : 3 / 2,
                      borderRadius: radius.sm,
                      backgroundColor: t.cardAlt,
                    }}
                    contentFit="contain"
                  />
                </Pressable>
                <Body muted style={{ fontSize: 12 }}>Tap to see it full size.</Body>
              </Card>
            ))}

            {section.comic.map((panel, i) => (
              <Card key={panel.id} style={{ gap: 10 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label>Panel {i + 1}</Label>
                  <Pressable onPress={() => confirmRemove(panel, i)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={17} color={t.danger} />
                  </Pressable>
                </Row>

                {/* capped so a panel stays comic-sized on a tablet or the web build */}
                <Pressable
                  onPress={() => (panel.uri ? setViewing(panel) : pickFor(panel))}
                  style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
                  {panel.uri ? (
                    <Image
                      source={{ uri: panel.uri }}
                      style={{ width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: t.cardAlt }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: '100%',
                        aspectRatio: 16 / 9,
                        borderRadius: radius.sm,
                        backgroundColor: t.cardAlt,
                        borderWidth: 1,
                        borderColor: t.border,
                        borderStyle: 'dashed',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}>
                      <Ionicons name="image-outline" size={26} color={t.faint} />
                      <Body muted style={{ fontSize: 12 }}>Tap to add the picture</Body>
                    </View>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setEditing(panel);
                    setDraft(panel.scene);
                  }}>
                  <Body selectable={false}>{panel.scene || 'Untitled scene'}</Body>
                </Pressable>

                {panel.prompt && panel.prompt !== panel.scene ? (
                  <View style={{ backgroundColor: t.cardAlt, borderRadius: radius.sm, padding: 10 }}>
                    <Label>Image prompt</Label>
                    <View style={{ marginTop: 6 }}>
                      <Collapsible text={panel.prompt} lines={3} />
                    </View>
                  </View>
                ) : null}

                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <Button
                    small
                    variant="soft"
                    icon={copied === panel.id ? 'checkmark' : 'copy-outline'}
                    label={copied === panel.id ? 'Copied!' : 'Copy prompt'}
                    onPress={() => copyPrompt(panel)}
                  />
                  <Button
                    small
                    variant="ghost"
                    icon={panel.uri ? 'swap-horizontal-outline' : 'image-outline'}
                    label={panel.uri ? 'Swap picture' : 'Add picture'}
                    onPress={() => pickFor(panel)}
                  />
                  {panel.uri ? (
                    <Button
                      small
                      variant="ghost"
                      icon="close"
                      label="Remove picture"
                      onPress={() => {
                        deletePhoto(panel.uri!);
                        updatePanel(section.id, panel.id, { uri: undefined });
                      }}
                    />
                  ) : null}
                </Row>
              </Card>
            ))}

            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Button small variant="ghost" icon="add" label="Add a scene" onPress={addBlank} />
              <Button small variant="ghost" icon="sparkles-outline" label="More scenes with AI" onPress={goAi} />
            </Row>
          </>
        )}
      </ScrollView>

      {/* full-size viewer */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {viewing?.uri ? <Image source={{ uri: viewing.uri }} style={{ width: '100%', height: '75%' }} contentFit="contain" /> : null}
          {viewing?.scene ? (
            <Body style={{ color: '#FFF', marginTop: 16, textAlign: 'center' }}>{viewing.scene}</Body>
          ) : null}
          <Body style={{ color: '#FFF', opacity: 0.6, marginTop: 12, fontSize: 12 }}>Tap anywhere to close</Body>
        </Pressable>
      </Modal>

      {/* whole-page viewer */}
      <Modal visible={!!viewingSheet} transparent animationType="fade" onRequestClose={() => setViewingSheet(null)}>
        <Pressable
          onPress={() => setViewingSheet(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          {viewingSheet ? (
            <Image source={{ uri: viewingSheet.uri }} style={{ width: '100%', height: '90%' }} contentFit="contain" />
          ) : null}
          <Body style={{ color: '#FFF', opacity: 0.6, marginTop: 12, fontSize: 12 }}>Tap anywhere to close</Body>
        </Pressable>
      </Modal>

      {/* scene caption editor */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 12 }}>
          <Title>Scene</Title>
          <Body muted style={{ fontSize: 13 }}>
            The caption that sits under this panel.
          </Body>
          <Field value={draft} onChangeText={setDraft} multiline style={{ minHeight: 120 }} autoFocus />
          <Row gap={10}>
            <Button style={{ flex: 1 }} variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
            <Button
              style={{ flex: 1 }}
              icon="checkmark"
              label="Save"
              onPress={() => {
                if (editing) updatePanel(section.id, editing.id, { scene: draft.trim() });
                setEditing(null);
              }}
            />
          </Row>
        </View>
      </Modal>
    </>
  );
}
