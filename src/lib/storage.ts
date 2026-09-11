import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { AppState, Platform } from 'react-native';

/**
 * Where the library actually lives.
 *
 * It used to be a single JSON string in AsyncStorage, which on Android is a
 * SQLite database with a hard 6 MB default ceiling — and the library carries
 * every page's text plus, once a chapter is cast for reading, that same text
 * again as narration lines. Past the ceiling the write fails, the app dies and
 * you land back on the Library. A plain file in the app's document folder has
 * no such limit, so that is where it goes now.
 *
 * Web keeps AsyncStorage, because expo-file-system's File class is native-only.
 */
const FILE_NAME = 'library.json';
const onWeb = Platform.OS === 'web';

const libraryFile = () => new File(Paths.document, FILE_NAME);

function writeNow(value: string) {
  const file = libraryFile();
  if (!file.exists) file.create();
  file.write(value);
}

/**
 * A save is the whole library rewritten, so doing it on every keystroke of a
 * page label would be brutal on a big shelf. Saves are coalesced, and flushed
 * the moment the app goes to the background so nothing is lost on the way out.
 */
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending === null) return;
  const value = pending;
  pending = null;
  try {
    writeNow(value);
  } catch {
    /* a failed save should never take the app down with it */
  }
}

if (!onWeb) {
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') flush();
  });
}

export const libraryStorage = {
  async getItem(name: string): Promise<string | null> {
    if (onWeb) return AsyncStorage.getItem(name);

    try {
      const file = libraryFile();
      if (file.exists) return await file.text();
    } catch {
      /* fall through to the old box */
    }

    // First run after the move: lift whatever is in AsyncStorage into the file
    // and clear the old key, so the 6 MB box stops being in the way.
    try {
      const legacy = await AsyncStorage.getItem(name);
      if (legacy) {
        writeNow(legacy);
        await AsyncStorage.removeItem(name);
        return legacy;
      }
    } catch {
      /* nothing saved yet, or the old value is unreadable */
    }
    return null;
  },

  async setItem(name: string, value: string): Promise<void> {
    if (onWeb) return AsyncStorage.setItem(name, value);
    pending = value;
    if (!timer) timer = setTimeout(flush, 300);
  },

  async removeItem(name: string): Promise<void> {
    if (onWeb) return AsyncStorage.removeItem(name);
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      const file = libraryFile();
      if (file.exists) file.delete();
    } catch {
      /* already gone */
    }
  },
};

/** Size of the saved library on disk, for the Settings screen. */
export function librarySizeBytes(): number {
  if (onWeb) return 0;
  try {
    const file = libraryFile();
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}
