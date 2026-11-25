import { useState } from 'react';
import { StyleSheet, Text, View } from '@/components/app-primitives';

import { AuthorizedImage } from '@/components/AuthorizedImage';
import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';

type UserAvatarProps = {
  name?: string | null;
  avatarUri?: string | null;
  accessToken?: string | null;
  size?: number;
  backgroundColor?: string;
  textColor?: string;
};

/**
 * Displays the user's JWT-protected avatar image with an automatic fallback
 * to the first-letter initial circle when no avatar is set or loading fails.
 */
export function UserAvatar({
  name,
  avatarUri,
  accessToken,
  size = 42,
  backgroundColor = '#DDECE1',
  textColor = C.primary,
}: UserAvatarProps) {
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);
  const failed = Boolean(avatarUri && failedAvatarUri === avatarUri);

  const initial = name?.trim().charAt(0).toLocaleUpperCase() || 'G';
  const fontSize = Math.max(12, Math.round(size * 0.42));

  return (
    <View
      style={[
        s.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}>
      <Text style={[s.initial, { fontSize, color: textColor }]}>{initial}</Text>
      {avatarUri && accessToken && !failed ? (
        <AuthorizedImage
          uri={avatarUri}
          accessToken={accessToken}
          contentFit="cover"
          onError={() => setFailedAvatarUri(avatarUri)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: F.bold,
  },
});
