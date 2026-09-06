import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const PAGES_DIR = 'pages';

function pagesDir(): Directory | null {
  try {
    const dir = new Directory(Paths.document, PAGES_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
  } catch {
    return null;
  }
}

/**
 * Photos handed over by the image picker live in a cache folder the OS can
 * clear at any time, so copy each one into the app's document folder and keep
 * that URI instead.
 */
export async function persistPhoto(sourceUri: string, id: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = pagesDir();
    if (!dir) return sourceUri;
    const ext = (sourceUri.split('?')[0].match(/\.(jpe?g|png|heic|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = new ExpoFile(dir, `${id}.${ext}`);
    if (dest.exists) dest.delete();
    // copy() is async — the picker can hand back a content:// URI on Android,
    // and awaiting it is what actually guarantees the file exists before we use its uri.
    await new ExpoFile(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return sourceUri; // worst case we keep the original URI
  }
}

export function deletePhoto(uri: string) {
  try {
    if (!uri.includes(`/${PAGES_DIR}/`)) return;
    const file = new ExpoFile(uri);
    if (file.exists) file.delete();
  } catch {
    /* a missing file is not worth bothering the user about */
  }
}

export async function exportBackup(json: string): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `book-friend-backup-${stamp}.json`;
  // expo-file-system's File/Directory classes aren't implemented on web, so the
  // browser's own Blob + download-link dance stands in for "save to disk" there.
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return url;
  }
  const file = new ExpoFile(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Book Friend backup' });
  }
  return file.uri;
}

/** The bit of a DocumentPicker asset this needs — narrowed so callers don't have to import the picker's types here. */
type PickedFile = { uri: string; file?: File | null };

export async function readTextFile(asset: PickedFile): Promise<string> {
  // On web the picker hands back a real browser File on `.file` (the `.uri` is a
  // blob: URL that expo-file-system's File class does not understand); everywhere
  // else it hands back a file:// / content:// uri that expo-file-system does.
  if (Platform.OS === 'web' && asset.file) return await asset.file.text();
  const file = new ExpoFile(asset.uri);
  return await file.text();
}
