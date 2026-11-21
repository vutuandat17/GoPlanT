import { router, type Href } from 'expo-router';

/** Navigates back when possible, falling back to replacing with a safe root route. */
export function safeBack(fallback: Href = '/home' as Href) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
