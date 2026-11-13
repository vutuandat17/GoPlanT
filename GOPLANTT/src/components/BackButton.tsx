import type { StyleProp, ViewStyle } from 'react-native';

import { Pressable, StyleSheet, View } from '@/components/app-primitives';
import { GoPlantColors as C } from '@/constants/theme';

export function BackButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Quay lại"
    hitSlop={8}
    onPress={onPress}
    style={[styles.button, style]}>
    <View style={styles.arrow}>
      <View style={styles.headTop} />
      <View style={styles.headBottom} />
      <View style={styles.stem} />
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C.softSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  headTop: {
    position: 'absolute',
    left: 3,
    top: 6,
    width: 9,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: C.forest,
    transform: [{ rotate: '-45deg' }],
  },
  headBottom: {
    position: 'absolute',
    left: 3,
    bottom: 6,
    width: 9,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: C.forest,
    transform: [{ rotate: '45deg' }],
  },
  stem: {
    position: 'absolute',
    left: 4,
    top: 9.75,
    width: 15,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: C.forest,
  },
});
