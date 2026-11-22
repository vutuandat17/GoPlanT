import { useEffect, useState, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

type AuthorizedImageProps = {
  uri?: string | null;
  accessToken?: string | null;
  style?: ComponentProps<typeof ExpoImage>['style'];
  contentFit?: ComponentProps<typeof ExpoImage>['contentFit'];
  accessibilityLabel?: string;
  onError?: () => void;
};

/**
 * Loads JWT-protected images across both Native (via ExpoImage headers)
 * and Web (via fetch + Blob ObjectURL, since browser <img> cannot send Authorization headers).
 */
export function useAuthorizedImageSource(uri?: string | null, accessToken?: string | null) {
  const [webObjectUrl, setWebObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (Platform.OS !== 'web') {
      setWebObjectUrl(null);
      return;
    }
    if (!uri || !accessToken) {
      setWebObjectUrl(null);
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    const controller = new AbortController();

    fetch(uri, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setWebObjectUrl(createdUrl);
      })
      .catch((err) => {
        if (!active || (err instanceof Error && err.name === 'AbortError')) return;
        setWebObjectUrl(null);
        setFailed(true);
      });

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [uri, accessToken]);

  if (!uri || !accessToken || failed) {
    return { source: null, failed };
  }
  if (Platform.OS === 'web') {
    return { source: webObjectUrl ? { uri: webObjectUrl } : null, failed };
  }
  return {
    source: { uri, headers: { Authorization: `Bearer ${accessToken}` } },
    failed,
  };
}

export function AuthorizedImage({
  uri,
  accessToken,
  style,
  contentFit = 'cover',
  accessibilityLabel,
  onError,
}: AuthorizedImageProps) {
  const { source, failed } = useAuthorizedImageSource(uri, accessToken);

  useEffect(() => {
    if (failed) onError?.();
  }, [failed, onError]);

  if (!source) return null;

  return (
    <ExpoImage
      key={uri ?? undefined}
      source={source}
      contentFit={contentFit}
      cachePolicy="none"
      accessibilityLabel={accessibilityLabel}
      onError={onError}
      style={style}
    />
  );
}
