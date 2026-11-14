import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { GoPlantColors } from '@/constants/theme';
import { AuthSessionProvider } from '@/features/auth/AuthSession';
import { PlantDataProvider } from '@/features/plants/PlantDataStore';
import { AppPreferencesProvider, useAppPreferences } from '@/features/preferences/AppPreferences';
import { CareScheduleProvider } from '@/features/schedule/CareScheduleStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return <AppPreferencesProvider><AppShell /></AppPreferencesProvider>;
}

function AppShell() {
  const { resolvedTheme } = useAppPreferences();
  const backgroundColor = resolvedTheme === 'dark' ? '#000000' : GoPlantColors.background;
  return <>
    <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    <AuthSessionProvider>
      <PlantDataProvider>
        <CareScheduleProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor } }} />
        </CareScheduleProvider>
      </PlantDataProvider>
    </AuthSessionProvider>
  </>;
}
