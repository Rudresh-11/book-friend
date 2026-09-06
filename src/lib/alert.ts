import { Alert, Platform } from 'react-native';

type Button = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

/**
 * react-native-web's Alert.alert() is a no-op stub — it neither shows anything
 * nor calls any button's onPress — so every confirm/error dialog in the app
 * silently did nothing when tested in a browser. This bridges to the browser's
 * own confirm()/alert() on web and defers to the real thing everywhere else.
 */
export function notify(title: string, message?: string, buttons?: Button[]) {
  if (Platform.OS !== 'web') return Alert.alert(title, message, buttons);

  const text = [title, message].filter(Boolean).join('\n\n');
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const proceedBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];
  if (window.confirm(text)) proceedBtn.onPress?.();
  else cancelBtn?.onPress?.();
}
