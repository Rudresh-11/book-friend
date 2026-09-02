/**
 * On-device text recognition.
 *
 * Uses Google ML Kit, which runs entirely on the phone — no server, no network.
 * It is a native module, so it only exists in a development build / release
 * build (`npx expo run:android`), not in Expo Go. Everything is loaded lazily
 * and guarded so the app still runs fine without it: the UI then falls back to
 * the "transcribe with another AI" copy/paste flow.
 */

type MLKitModule = {
  recognize: (uri: string) => Promise<{ text: string; blocks?: { text: string }[] }>;
};

let cached: MLKitModule | null | undefined;

function load(): MLKitModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-ml-kit/text-recognition');
    const impl = (mod?.default ?? mod) as MLKitModule;
    cached = typeof impl?.recognize === 'function' ? impl : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isOcrAvailable(): boolean {
  return load() !== null;
}

export type OcrResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'unavailable' | 'failed'; message: string };

export async function recognizeText(uri: string): Promise<OcrResult> {
  const impl = load();
  if (!impl) {
    return {
      ok: false,
      reason: 'unavailable',
      message:
        'On-device text recognition needs a development build. Run "npx expo run:android" once, or use "Transcribe with AI" instead.',
    };
  }
  try {
    const res = await impl.recognize(uri);
    const text = (res?.text ?? '').trim();
    if (!text) return { ok: false, reason: 'failed', message: 'No readable text found in that photo.' };
    return { ok: true, text: tidy(text) };
  } catch (e: any) {
    return { ok: false, reason: 'failed', message: e?.message ?? 'Text recognition failed.' };
  }
}

const PARA_MARK = String.fromCharCode(0);

/**
 * Book scans come back with hard line wraps and words hyphenated across lines.
 * Re-flow them into paragraphs so summaries and word counts behave.
 */
export function tidy(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/-\n(\p{Ll})/gu, '$1') // stitch hyphenated words back together
    .replace(/\n{2,}/g, PARA_MARK) // remember real paragraph breaks
    .replace(/\n/g, ' ') // un-wrap the scanner's hard line breaks
    .split(PARA_MARK)
    .join('\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
