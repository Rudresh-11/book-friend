import { Directory, File, Paths } from 'expo-file-system';
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
export function persistPhoto(sourceUri: string, id: string): string {
  if (Platform.OS === 'web') return sourceUri;
  try {
    const dir = pagesDir();
    if (!dir) return sourceUri;
    const ext = (sourceUri.split('?')[0].match(/\.(jpe?g|png|heic|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = new File(dir, `${id}.${ext}`);
    if (dest.exists) dest.delete();
    new File(sourceUri).copy(dest);
    return dest.uri;
  } catch {
    return sourceUri; // worst case we keep the original URI
  }
}

export function deletePhoto(uri: string) {
  try {
    if (!uri.includes(`/${PAGES_DIR}/`)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* a missing file is not worth bothering the user about */
  }
}

export async function exportBackup(json: string): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `book-friend-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Book Friend backup' });
  }
  return file.uri;
}

export async function readTextFile(uri: string): Promise<string> {
  const file = new File(uri);
  return await file.text();
}
