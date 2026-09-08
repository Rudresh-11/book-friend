import * as Clipboard from 'expo-clipboard';
import { notify } from './alert';

/**
 * Copy text and say so when it fails. A rejected clipboard write used to leave
 * the button sitting there looking like nothing happened — browsers refuse the
 * write whenever the page isn't focused, and the whole prompt round trip is
 * useless if you think you copied something and didn't.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (e: any) {
    notify('Could not copy that', e?.message ?? 'This device would not let the app use the clipboard.');
    return false;
  }
}
