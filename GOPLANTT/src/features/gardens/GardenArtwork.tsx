import { useEffect, useState, type ComponentProps } from 'react';
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
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [photoUri]);

  return (
    <View style={[s.frame, style]}>
      <Text style={glyphStyle}>♧</Text>
      <Text style={labelStyle}>{locationType.toLocaleUpperCase()}</Text>
      {photoUri && accessToken && !photoFailed ? (
        <AuthorizedImage
          uri={photoUri}
          accessToken={accessToken}
          contentFit="cover"
          onError={() => setPhotoFailed(true)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
