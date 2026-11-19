import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { setCurrentLanguage } from './translations';

export type AppLanguage = 'vi' | 'en';
export type AppTheme = 'system' | 'light' | 'dark';

type Preferences = {
  language: AppLanguage;
  theme: AppTheme;
  resolvedTheme: 'light' | 'dark';
  careNotificationsEnabled: boolean;
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  setCareNotificationsEnabled: (enabled: boolean) => void;
};

const PreferencesContext = createContext<Preferences>({
  language: 'vi',
  theme: 'system',
  resolvedTheme: 'light',
  careNotificationsEnabled: true,
  setLanguage: () => {},
  setTheme: () => {},
  setCareNotificationsEnabled: () => {},
});
const preferenceFile = `${FileSystem.documentDirectory ?? ''}goplant-preferences.json`;

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [language, setLanguage] = useState<AppLanguage>('vi');
  const [theme, setThemeState] = useState<AppTheme>('system');
  const [careNotificationsEnabled, setCareNotificationsEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const saved = Platform.OS === 'web'
          ? globalThis.localStorage?.getItem('goplant-preferences')
          : preferenceFile && await FileSystem.readAsStringAsync(preferenceFile).catch(() => null);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<{
            language: AppLanguage;
            theme: AppTheme;
            careNotificationsEnabled: boolean;
          }>;
          if (active && (parsed.language === 'vi' || parsed.language === 'en')) { setLanguage(parsed.language); setCurrentLanguage(parsed.language); }
          if (active && (parsed.theme === 'system' || parsed.theme === 'light' || parsed.theme === 'dark')) setThemeState(parsed.theme);
          if (active && typeof parsed.careNotificationsEnabled === 'boolean') setCareNotificationsEnabled(parsed.careNotificationsEnabled);
        }
      } catch { /* Keep the default preferences if local storage is unavailable. */ }
      if (active) setLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const value = JSON.stringify({ language, theme, careNotificationsEnabled });
    if (Platform.OS === 'web') {
      try { globalThis.localStorage?.setItem('goplant-preferences', value); } catch { /* Storage can be disabled by the browser. */ }
    } else if (preferenceFile) {
      void FileSystem.writeAsStringAsync(preferenceFile, value).catch(() => {});
    }
  }, [language, theme, careNotificationsEnabled, loaded]);

  const setAppTheme = (next: AppTheme) => {
    setThemeState(next);
    Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  };
  const setAppLanguage = (next: AppLanguage) => {
    setLanguage(next);
    setCurrentLanguage(next);
  };
  const value = useMemo<Preferences>(() => ({
    language,
    theme,
    resolvedTheme: theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme,
    careNotificationsEnabled,
    setLanguage: setAppLanguage,
    setTheme: setAppTheme,
    setCareNotificationsEnabled,
  }), [language, theme, careNotificationsEnabled, systemScheme]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  return useContext(PreferencesContext);
}
