import { useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from '@/components/app-primitives';
import { AuthorizedImage } from '@/components/AuthorizedImage';

type Props = {
  locationType: string;
  photoUri?: string | null;
  accessToken?: string | null;
  style?: ComponentProps<typeof View>['style'];
  glyphStyle?: ComponentProps<typeof Text>['style'];
  labelStyle?: ComponentProps<typeof Text>['style'];
};

export function GardenArtwork({ locationType, photoUri, accessToken, style, glyphStyle, labelStyle }: Props) {
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);
  const photoFailed = Boolean(photoUri && failedPhotoUri === photoUri);

  return (
    <View style={[s.frame, style]}>
      <Text style={glyphStyle}>♧</Text>
      <Text style={labelStyle}>{locationType.toLocaleUpperCase()}</Text>
      {photoUri && accessToken && !photoFailed ? (
        <AuthorizedImage
          uri={photoUri}
          accessToken={accessToken}
          contentFit="cover"
          onError={() => setFailedPhotoUri(photoUri ?? null)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
