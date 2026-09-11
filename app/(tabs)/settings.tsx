import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, Field, Label, Row, SectionHeading } from '../../src/components/ui';
import { notify } from '../../src/lib/alert';
import { exportLibraryZip, exportLibraryZipStreaming, humanSize, importLibraryZip } from '../../src/lib/archive';
import { COPY_PICKED_FILE, exportBackup, readBytesFile, readTextFile } from '../../src/lib/files';
import { librarySizeBytes } from '../../src/lib/storage';
import { isOcrAvailable } from '../../src/lib/ocr';
import { useLibrary } from '../../src/store';
import { useTheme } from '../../src/theme';
import type { SectionKind } from '../../src/types';

const KINDS: SectionKind[] = ['Chapter', 'Part', 'Section', 'Episode', 'Lesson'];

export default function Settings() {
  const t = useTheme();
  const state = useLibrary();
  const { settings, updateSettings, replaceAll, wipe } = useLibrary();
  const [flavour, setFlavour] = useState(settings.promptFlavour);
  const [goal, setGoal] = useState(String(settings.dailyGoalMinutes));
  const [language, setLanguage] = useState(settings.language);
  const [busy, setBusy] = useState<string | null>(null);

  const library = { books: state.books, sections: state.sections, sessions: state.sessions, settings: state.settings };

  /** The whole library — pictures and all — as one movable zip. */
  const doExport = async () => {
    if (busy) return;
    setBusy('Packing your library…');
    try {
      // streaming keeps memory to one picture at a time; web has no file handles,
      // so it builds the archive in memory instead
      const pack = Platform.OS === 'web' ? exportLibraryZip : exportLibraryZipStreaming;
      const { pictures, bytes } = await pack(library, (done, total, label) =>
        setBusy(total ? `${label} ${done}/${total}` : label)
      );
      setBusy(null);
      notify(
        'Backup ready',
        `${state.books.length} books and ${pictures} pictures, ${humanSize(bytes)}. Keep it somewhere safe — it restores onto any phone.`
      );
    } catch (e: any) {
      setBusy(null);
      notify('Export failed', e?.message ?? 'Unknown error');
    }
  };

  /** Text-only escape hatch, for reading the data somewhere else. */
  const doExportJson = async () => {
    try {
      await exportBackup(JSON.stringify(library, null, 2));
    } catch (e: any) {
      notify('Export failed', e?.message ?? 'Unknown error');
    }
  };

  const doImport = async () => {
    if (busy) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        // both kinds of backup, plus a catch-all for pickers that report zips oddly
        type: ['application/zip', 'application/json', '*/*'],
        copyToCacheDirectory: COPY_PICKED_FILE,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const isZip = /\.zip$/i.test(asset.name ?? '') || asset.mimeType === 'application/zip';

      setBusy('Reading the backup…');
      const restore = isZip
        ? await importLibraryZip(await readBytesFile(asset), (done, total, label) =>
            setBusy(total ? `${label} ${done}/${total}` : label)
          )
        : { state: JSON.parse(await readTextFile(asset)), pictures: 0 };
      setBusy(null);

      const data = restore.state;
      if (!Array.isArray(data.books)) throw new Error('That file is not a Book Friend backup.');

      notify(
        'Replace everything?',
        `The backup holds ${data.books.length} books${restore.pictures ? ` and ${restore.pictures} pictures` : ''}. Your current library is replaced.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: () => replaceAll(data) },
        ]
      );
    } catch (e: any) {
      setBusy(null);
      notify('Import failed', e?.message ?? 'Unknown error');
    }
  };

  const confirmWipe = () =>
    notify('Erase everything?', 'Every book, scan and summary on this phone. There is no undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: wipe },
    ]);

  const ocr = isOcrAvailable();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <SectionHeading>Look</SectionHeading>
      <Card style={{ gap: 10 }}>
        <Label>Theme</Label>
        <Row>
          {(['system', 'light', 'dark'] as const).map((m) => (
            <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} active={settings.theme === m} onPress={() => updateSettings({ theme: m })} />
          ))}
        </Row>
      </Card>

      <SectionHeading>Reading</SectionHeading>
      <Card style={{ gap: 14 }}>
        <Field
          label="Daily goal (minutes)"
          value={goal}
          onChangeText={setGoal}
          onBlur={() => updateSettings({ dailyGoalMinutes: Math.max(1, parseInt(goal, 10) || 20) })}
          keyboardType="number-pad"
        />
        <View style={{ gap: 8 }}>
          <Label>Default name for a book's pieces</Label>
          <Row style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <Chip key={k} label={k} active={settings.defaultKind === k} onPress={() => updateSettings({ defaultKind: k })} />
            ))}
          </Row>
        </View>
      </Card>

      <SectionHeading>AI prompts</SectionHeading>
      <Card style={{ gap: 14 }}>
        <Field
          label="Answer language"
          value={language}
          onChangeText={setLanguage}
          onBlur={() => updateSettings({ language: language.trim() || 'English' })}
          placeholder="English"
        />
        <Field
          label="Extra instruction added to every prompt"
          value={flavour}
          onChangeText={setFlavour}
          onBlur={() => updateSettings({ promptFlavour: flavour })}
          multiline
          placeholder="e.g. Keep it short and plain. I'm reading for pleasure, not study."
        />
        <Pressable onPress={() => updateSettings({ spoilerSafe: !settings.spoilerSafe })} hitSlop={6}>
          <Row gap={10}>
            <Ionicons
              name={settings.spoilerSafe ? 'checkbox' : 'square-outline'}
              size={20}
              color={settings.spoilerSafe ? t.accent : t.faint}
            />
            <Body style={{ flex: 1, fontSize: 14 }}>Ask for no spoilers beyond what I've read</Body>
          </Row>
        </Pressable>
      </Card>

      <SectionHeading>Text recognition</SectionHeading>
      <Card style={{ gap: 8 }}>
        <Row gap={8}>
          <Ionicons name={ocr ? 'checkmark-circle' : 'information-circle-outline'} size={20} color={ocr ? t.good : t.muted} />
          <Body style={{ flex: 1, fontWeight: '600' }}>{ocr ? 'On-device scanning is active' : 'On-device scanning is off'}</Body>
        </Row>
        <Body muted style={{ fontSize: 13 }}>
          {ocr
            ? 'Page photos are read on the phone with ML Kit. Nothing is uploaded.'
            : 'ML Kit is a native module, so it only works in a development build. Run "npx expo run:android" once to switch it on. Until then use the "Transcribe with AI" prompt.'}
        </Body>
      </Card>

      <SectionHeading>Your data</SectionHeading>
      <Card style={{ gap: 12 }}>
        <Body muted style={{ fontSize: 13 }}>
          Everything lives on this phone — {state.books.length} books, {state.sections.length} chapters,{' '}
          {state.sections.reduce((n, s) => n + s.pages.length, 0)} scans
          {librarySizeBytes() ? ` · ${humanSize(librarySizeBytes())} of text` : ''}. A backup is a single zip holding the
          library and every picture, so it restores whole onto another phone.
        </Body>
        {busy ? (
          <Row gap={8}>
            <ActivityIndicator size="small" color={t.accent} />
            <Body muted style={{ fontSize: 13 }}>{busy}</Body>
          </Row>
        ) : null}
        <Row gap={10}>
          <Button
            style={{ flex: 1 }}
            small
            variant="soft"
            icon="archive-outline"
            label="Back up"
            disabled={!!busy}
            onPress={doExport}
          />
          <Button
            style={{ flex: 1 }}
            small
            variant="soft"
            icon="download-outline"
            label="Restore"
            disabled={!!busy}
            onPress={doImport}
          />
        </Row>
        <Button small variant="ghost" icon="document-text-outline" label="Export text only (no pictures)" onPress={doExportJson} />
        <Button small variant="danger" icon="trash-outline" label="Erase everything" onPress={confirmWipe} />
      </Card>

      <Body muted style={{ fontSize: 12, textAlign: 'center', marginTop: 24 }}>
        Book Friend · offline reading journal
      </Body>
    </ScrollView>
  );
}
