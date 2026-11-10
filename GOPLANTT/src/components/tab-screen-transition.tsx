import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';

export function TabScreenTransition({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      // Opacity and translateY are native-driver compatible. Keeping the animation
      // off the JS thread avoids frame drops while Android mounts the next tab.
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [isFocused, progress]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
