import { Directory, File as ExpoFile, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Zip, ZipDeflate, unzipSync, zipSync } from 'fflate';
import { Platform } from 'react-native';
import type { LibraryState } from '../types';

/**
 * A whole library in one file.
 *
 * JSON alone only ever held the *paths* to your page photos, covers and comic
 * panels — move that file to another phone and every picture is a dead link.
 * The archive carries the pictures with it:
 *
 *   backup.json      the library, with every picture path rewritten to its
 *                    place inside this archive
 *   photos/…         page scans
 *   covers/…         book covers
 *   comics/…         comic panels and whole comic pages
 *
 * Restoring writes the pictures back into the app's own folder and rewrites the
 * paths again to wherever they landed, so the library arrives whole.
 */
const MANIFEST = 'backup.json';
const FOLDERS = { photos: 'photos', covers: 'covers', comics: 'comics' } as const;
type Folder = (typeof FOLDERS)[keyof typeof FOLDERS];

const RESTORED_DIR = 'restored';

/** Every picture the library points at, and which folder of the archive it belongs in. */
function picturesIn(state: LibraryState): { uri: string; folder: Folder }[] {
  const out: { uri: string; folder: Folder }[] = [];
  for (const book of state.books) {
    if (book.coverUri) out.push({ uri: book.coverUri, folder: FOLDERS.covers });
  }
  for (const section of state.sections) {
    for (const page of section.pages) {
      if (page.uri) out.push({ uri: page.uri, folder: FOLDERS.photos });
    }
    for (const panel of section.comic) {
      if (panel.uri) out.push({ uri: panel.uri, folder: FOLDERS.comics });
    }
    for (const sheet of section.comicSheets) {
      if (sheet.uri) out.push({ uri: sheet.uri, folder: FOLDERS.comics });
    }
  }
  return out;
}

const fileNameOf = (uri: string) => uri.split('?')[0].split('/').pop() || `${Date.now()}`;

/** Swap every picture path in the library for whatever `map` says it should be now. */
function remap(state: LibraryState, map: Map<string, string>): LibraryState {
  const at = (uri?: string) => (uri ? (map.get(uri) ?? uri) : uri);
  return {
    ...state,
    books: state.books.map((b) => ({ ...b, coverUri: at(b.coverUri) })),
    sections: state.sections.map((s) => ({
      ...s,
      pages: s.pages.map((p) => ({ ...p, uri: at(p.uri) ?? '' })),
      comic: s.comic.map((c) => ({ ...c, uri: at(c.uri) })),
      comicSheets: s.comicSheets.map((c) => ({ ...c, uri: at(c.uri) ?? '' })),
    })),
  };
}

export type ArchiveProgress = (done: number, total: number, label: string) => void;

/**
 * Build the archive and hand it to the share sheet. Returns a short summary so
 * the screen can say what actually went in.
 */
export async function exportLibraryZip(
  state: LibraryState,
  onProgress?: ArchiveProgress
): Promise<{ uri: string; pictures: number; bytes: number }> {
  const pictures = picturesIn(state);
  const entries: Record<string, Uint8Array> = {};
  const map = new Map<string, string>();
  const used = new Set<string>();

  let done = 0;
  for (const { uri, folder } of pictures) {
    done += 1;
    onProgress?.(done, pictures.length, 'Packing pictures');
    if (map.has(uri)) continue; // the same picture used twice only travels once

    // a name collision between two folders' files would silently drop one
    let name = fileNameOf(uri);
    let path = `${folder}/${name}`;
    for (let n = 2; used.has(path); n++) path = `${folder}/${n}-${name}`;

    try {
      const bytes = await new ExpoFile(uri).bytes();
      entries[path] = bytes;
      used.add(path);
      map.set(uri, path);
    } catch {
      // a picture the OS has since cleared out; the entry keeps its old path and
      // simply arrives broken rather than taking the whole backup down
    }
  }

  onProgress?.(pictures.length, pictures.length, 'Writing the archive');
  entries[MANIFEST] = new TextEncoder().encode(JSON.stringify(remap(state, map), null, 2));

  // level 0 for the pictures: JPEGs are already compressed, so squeezing them
  // again costs seconds and saves almost nothing. The JSON does compress well.
  const zipped = zipSync(entries, { level: 1, mem: 8 });

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `book-friend-backup-${stamp}.zip`;

  if (Platform.OS === 'web') {
    const blob = new Blob([zipped as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return { uri: url, pictures: map.size, bytes: zipped.length };
  }

  const file = new ExpoFile(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(zipped);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Save your Book Friend backup',
    });
  }
  return { uri: file.uri, pictures: map.size, bytes: zipped.length };
}

/**
 * The same archive, written a piece at a time.
 *
 * The version above holds every picture in memory and then the finished zip on
 * top of that — fine for a shelf of a few books, fatal for a few hundred
 * megabytes of page scans on a phone. This feeds one file in at a time and
 * appends each chunk straight to disk, so what it costs in memory is one
 * picture, not the whole library.
 */
export async function exportLibraryZipStreaming(
  state: LibraryState,
  onProgress?: ArchiveProgress
): Promise<{ uri: string; pictures: number; bytes: number }> {
  const pictures = picturesIn(state);

  // names are decided up front, so the manifest can be written into the stream too
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const { uri, folder } of pictures) {
    if (map.has(uri)) continue;
    const name = fileNameOf(uri);
    let path = `${folder}/${name}`;
    for (let n = 2; used.has(path); n++) path = `${folder}/${n}-${name}`;
    used.add(path);
    map.set(uri, path);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = new ExpoFile(Paths.cache, `book-friend-backup-${stamp}.zip`);
  if (out.exists) out.delete();
  out.create();

  let written = 0;
  const handle = out.open(FileMode.Truncate); // write from the start, chunk after chunk
  const zip = new Zip((err, chunk, final) => {
    if (err) throw err;
    handle.writeBytes(chunk);
    written += chunk.length;
    if (final) handle.close();
  });

  const push = async (path: string, bytes: Uint8Array, level: 0 | 1) => {
    const entry = new ZipDeflate(path, { level });
    zip.add(entry);
    entry.push(bytes, true);
  };

  await push(MANIFEST, new TextEncoder().encode(JSON.stringify(remap(state, map), null, 2)), 1);

  let done = 0;
  let saved = 0;
  for (const [uri, path] of map) {
    done += 1;
    onProgress?.(done, map.size, 'Packing pictures');
    try {
      // read, hand over, and let it go before the next one is read
      const bytes = await new ExpoFile(uri).bytes();
      await push(path, bytes, 0); // already-compressed JPEG; recompressing is wasted work
      saved += 1;
    } catch {
      /* a picture the OS has cleared out; the backup carries on without it */
    }
  }
  zip.end();

  onProgress?.(map.size, map.size, 'Finishing the archive');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out.uri, {
      mimeType: 'application/zip',
      dialogTitle: 'Save your Book Friend backup',
    });
  }
  return { uri: out.uri, pictures: saved, bytes: written };
}

/**
 * Read an archive back. The pictures are written into the app's own folder
 * under a fresh name, so restoring twice never overwrites what is already
 * there, and the library's paths are pointed at the new copies.
 */
export async function importLibraryZip(
  bytes: Uint8Array,
  onProgress?: ArchiveProgress
): Promise<{ state: LibraryState; pictures: number }> {
  const files = unzipSync(bytes);

  const manifest = files[MANIFEST];
  if (!manifest) throw new Error('That zip is not a Book Friend backup — it has no backup.json inside.');
  const state = JSON.parse(new TextDecoder().decode(manifest)) as LibraryState;
  if (!Array.isArray(state.books)) throw new Error('That backup.json is not a Book Friend library.');

  if (Platform.OS === 'web') return { state, pictures: 0 };

  const dir = new Directory(Paths.document, RESTORED_DIR, String(Date.now()));
  dir.create({ intermediates: true });

  const paths = Object.keys(files).filter((p) => p !== MANIFEST && files[p].length > 0);
  const map = new Map<string, string>();

  let done = 0;
  for (const path of paths) {
    done += 1;
    onProgress?.(done, paths.length, 'Restoring pictures');
    try {
      const out = new ExpoFile(dir, path.replace(/\//g, '-'));
      if (out.exists) out.delete();
      out.create();
      out.write(files[path]);
      map.set(path, out.uri);
    } catch {
      /* skip a picture that will not write rather than fail the whole restore */
    }
  }

  return { state: remap(state, map), pictures: map.size };
}

export const humanSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
