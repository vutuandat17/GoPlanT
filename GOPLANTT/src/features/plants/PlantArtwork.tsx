import { useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, View } from '@/components/app-primitives';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { AuthorizedImage } from '@/components/AuthorizedImage';
import { GoPlantColors as C } from '@/constants/theme';

type Props = {
  category: string;
  photoUri?: string | null;
  accessToken?: string | null;
  style?: ComponentProps<typeof View>['style'];
};

export function PlantArtwork({ category, photoUri, accessToken, style }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [photoUri]);

  const flower = /hoa|lan/i.test(category);
  const fruit = /quả|trái/i.test(category);
  const deepLeaf = /nội thất|gia vị/i.test(category);
  const leaf = deepLeaf ? '#247047' : '#39865A';
  const lightLeaf = deepLeaf ? '#72B77D' : '#8BCB8D';
  const background = flower ? '#FCEDE5' : fruit ? '#FFF3D9' : '#E4F3E8';

  return <View style={[s.frame, { backgroundColor: background }, style]}>
    <Svg width="100%" height="100%" viewBox="0 0 180 140" accessibilityLabel="Hình minh họa cây xanh">
      <Circle cx="90" cy="68" r="49" fill={flower ? '#F8DED1' : fruit ? '#FFE8B4' : '#D4EBDD'} opacity="0.8"/>
      <Path d="M90 104 C90 79 87 56 82 38 M90 83 C100 68 108 60 119 56 M88 73 C76 61 68 55 57 53" fill="none" stroke="#276343" strokeWidth="5" strokeLinecap="round"/>
      <Ellipse cx="70" cy="47" rx="18" ry="9" transform="rotate(28 70 47)" fill={lightLeaf}/>
      <Ellipse cx="111" cy="61" rx="19" ry="9" transform="rotate(-31 111 61)" fill={leaf}/>
      <Ellipse cx="96" cy="36" rx="17" ry="8" transform="rotate(-27 96 36)" fill={lightLeaf}/>
      {flower ? <><Circle cx="123" cy="39" r="7" fill="#F4A987"/><Circle cx="131" cy="34" r="6" fill="#FFD19F"/><Circle cx="132" cy="43" r="6" fill="#F7B9A5"/><Circle cx="125" cy="47" r="6" fill="#FFD19F"/><Circle cx="126" cy="40" r="3" fill="#E39C3E"/></> : null}
      {fruit ? <><Circle cx="68" cy="74" r="8" fill="#E88354"/><Circle cx="114" cy="82" r="8" fill="#E8A645"/><Path d="M67 65l2-4m44 14l3-4" stroke="#4B8B58" strokeWidth="2" strokeLinecap="round"/></> : null}
      <Path d="M59 101h62l-8 27H67z" fill="#B96E4C"/>
      <Rect x="55" y="98" width="70" height="8" rx="4" fill="#D38A62"/>
      <Path d="M73 111h34" stroke="#E9AD8A" strokeWidth="3" strokeLinecap="round"/>
      <Rect x="15" y="128" width="150" height="4" rx="2" fill={C.mint} opacity="0.85"/>
    </Svg>
    {photoUri && !photoFailed ? (
      <AuthorizedImage
        uri={photoUri}
        accessToken={accessToken}
        contentFit="cover"
        onError={() => setPhotoFailed(true)}
        style={StyleSheet.absoluteFill}
      />
    ) : null}
  </View>;
}

const s = StyleSheet.create({ frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' } });
