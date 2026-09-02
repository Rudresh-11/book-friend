import { router } from 'expo-router';

/**
 * router.back() throws "GO_BACK was not handled" when the screen was opened
 * directly (a deep link, or a reload on web). Fall back to a sensible screen.
 */
export function goBack(fallback: string = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
