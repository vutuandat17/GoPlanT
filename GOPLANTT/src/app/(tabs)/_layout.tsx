import { Pressable, StyleSheet, Text, View } from '@/components/app-primitives';
import { SafeAreaView } from '@/components/app-primitives';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { usePathname } from 'expo-router';

import { AppTopBar } from '@/components/app-top-bar';
import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { useAppPreferences } from '@/features/preferences/AppPreferences';

const tabs = [
  { name: 'home', label: 'Trang chủ', icon: '⌂' },
  { name: 'gardens', label: 'Vườn của tôi', icon: '▦' },
  { name: 'plants', label: 'Cây trồng', icon: '♧' },
  { name: 'schedule', label: 'Lịch chăm sóc', icon: '◷' },
  { name: 'monitoring', label: 'Theo dõi', icon: '☼' },
];

const titles: Record<string, string> = {
  '/home': 'Trang Chủ',
  '/gardens': 'Vườn của tôi',
  '/plants': 'Quản lý cây trồng',
  '/journal': 'Nhật ký phát triển',
  '/monitoring': 'Theo dõi & Ghi nhận',
  '/schedule': 'Lập lịch chăm sóc',
};

function MainTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const index = state.routes.findIndex((route) => route.name === tab.name);
        const route = state.routes[index];
        const selected = state.index === index;

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected || !route) return;
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!event.defaultPrevented) navigation.navigate(route.name as never);
            }}
            style={styles.navItem}>
            <Text style={[styles.navIcon, selected && styles.active]}>{tab.icon}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.navLabel, selected && styles.active]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MainTabsLayout() {
  const pathname = usePathname();
  const { resolvedTheme } = useAppPreferences();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppTopBar title={titles[pathname] ?? 'GoPlant'} />
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: resolvedTheme === 'dark' ? '#000000' : C.background } }}
        tabBar={(props) => <MainTabBar {...props} />}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="gardens" />
        <Tabs.Screen name="plants" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="monitoring" />
        <Tabs.Screen name="journal" options={{ href: null }} />
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  bottomNav: { width: '100%', maxWidth: 760, minHeight: 60, paddingHorizontal: 3, alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDE8E0', backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center' },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { color: C.secondaryText, fontSize: 18, lineHeight: 22 },
  navLabel: { color: C.secondaryText, fontFamily: F.regular, fontSize: 9 },
  active: { color: C.forest, fontFamily: F.semiBold },
});
