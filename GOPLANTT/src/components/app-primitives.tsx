import { Fragment, type ReactNode } from 'react';
import * as RN from 'react-native';
import { SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context';

import { useAppPreferences } from '@/features/preferences/AppPreferences';
import { getCurrentLanguage, translateText } from '@/features/preferences/translations';

type Scheme = 'light' | 'dark';

function toHsl(hex: string): [number, number, number] | null {
  const value = hex.replace('#', '');
  if (value.length !== 6) return null;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function themedColor(color: unknown, property: string, scheme: Scheme): unknown {
  if (scheme !== 'dark' || typeof color !== 'string' || !color.startsWith('#')) return color;
  const hsl = toHsl(color);
  if (!hsl) return color;
  const [h, s, l] = hsl;
  if (property === 'color' || property === 'tintColor' || property === 'placeholderTextColor') {
    if (l > 0.94) return color;
    return fromHsl(h, s < 0.16 ? 0.08 : s, s < 0.16 ? 0.82 : Math.max(0.62, Math.min(0.78, l + 0.30)));
  }
  if (property.toLowerCase().includes('border')) return s < 0.18 ? '#35443A' : fromHsl(h, s, Math.max(0.25, l * 0.55));
  if (property === 'backgroundColor') {
    // This is the light-mode page canvas color; keep the dark-mode canvas truly black.
    if (color.toUpperCase() === '#F4FBF5') return '#000000';
    if (l > 0.92 && s < 0.18) return l > 0.98 ? '#1B2820' : '#101814';
    if (l > 0.68) return s < 0.18 ? '#25342B' : fromHsl(h, Math.max(0.20, s), 0.22);
    if (l < 0.22 && s > 0.16) return fromHsl(h, s, 0.34);
    return fromHsl(h, s, Math.max(0.16, l * 0.68));
  }
  return color;
}

function themedStyle(style: unknown, scheme: Scheme): unknown {
  if (Array.isArray(style)) return style.map((item) => themedStyle(item, scheme));
  if (!style || typeof style !== 'object') return style;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    result[key] = /color$/i.test(key) ? themedColor(value, key, scheme) : value;
  }
  return result;
}

function localizedChildren(children: ReactNode, language: 'vi' | 'en'): ReactNode {
  if (typeof children === 'string') return translateText(children, language);
  if (Array.isArray(children)) return children.map((child, index) => <Fragment key={index}>{localizedChildren(child, language)}</Fragment>);
  return children;
}

export function Text({ children, style, ...props }: RN.TextProps) {
  const { resolvedTheme, language } = useAppPreferences();
  return <RN.Text {...props} style={themedStyle(style, resolvedTheme) as RN.TextStyle}>{localizedChildren(children, language)}</RN.Text>;
}

export function View({ style, ...props }: RN.ViewProps) {
  const { resolvedTheme } = useAppPreferences();
  return <RN.View {...props} style={themedStyle(style, resolvedTheme) as RN.ViewStyle} />;
}

export function Pressable({ style, accessibilityLabel, accessibilityHint, ...props }: RN.PressableProps) {
  const { resolvedTheme, language } = useAppPreferences();
  const themed = typeof style === 'function'
    ? (state: RN.PressableStateCallbackType) => themedStyle(style(state), resolvedTheme) as RN.StyleProp<RN.ViewStyle>
    : themedStyle(style, resolvedTheme) as RN.StyleProp<RN.ViewStyle>;
  return <RN.Pressable {...props} accessibilityLabel={accessibilityLabel ? translateText(accessibilityLabel, language) : undefined} accessibilityHint={accessibilityHint ? translateText(accessibilityHint, language) : undefined} style={themed} />;
}

export function ScrollView({ style, contentContainerStyle, ...props }: RN.ScrollViewProps) {
  const { resolvedTheme } = useAppPreferences();
  return <RN.ScrollView {...props} style={themedStyle(style, resolvedTheme) as RN.ViewStyle} contentContainerStyle={themedStyle(contentContainerStyle, resolvedTheme) as RN.ViewStyle} />;
}

export function TextInput({ style, placeholder, placeholderTextColor, ...props }: RN.TextInputProps) {
  const { resolvedTheme, language } = useAppPreferences();
  return <RN.TextInput {...props} placeholder={placeholder ? translateText(placeholder, language) : undefined} placeholderTextColor={themedColor(placeholderTextColor, 'placeholderTextColor', resolvedTheme) as string} style={themedStyle(style, resolvedTheme) as RN.TextStyle} />;
}

export function Image({ style, ...props }: RN.ImageProps) {
  const { resolvedTheme } = useAppPreferences();
  return <RN.Image {...props} style={themedStyle(style, resolvedTheme) as RN.ImageStyle} />;
}

export function Switch({ style, trackColor, thumbColor, ...props }: RN.SwitchProps) {
  const { resolvedTheme } = useAppPreferences();
  return <RN.Switch {...props} style={themedStyle(style, resolvedTheme) as RN.ViewStyle} trackColor={trackColor ? { false: themedColor(trackColor.false, 'backgroundColor', resolvedTheme) as string, true: themedColor(trackColor.true, 'backgroundColor', resolvedTheme) as string } : undefined} thumbColor={themedColor(thumbColor, 'backgroundColor', resolvedTheme) as string} />;
}

export function SafeAreaView({ style, ...props }: React.ComponentProps<typeof NativeSafeAreaView>) {
  const { resolvedTheme } = useAppPreferences();
  return <NativeSafeAreaView {...props} style={themedStyle(style, resolvedTheme) as RN.ViewStyle} />;
}

export const Alert = {
  ...RN.Alert,
  alert: (title: string, message?: string, buttons?: RN.AlertButton[], options?: RN.AlertOptions) => {
    const language = getCurrentLanguage();
    const translatedTitle = translateText(title, language);
    const translatedMessage = message ? translateText(message, language) : undefined;
    const translatedButtons = buttons?.map((button) => ({
      ...button,
      text: button.text ? translateText(button.text, language) : undefined,
    }));

    if (RN.Platform.OS === 'web' && typeof globalThis.window !== 'undefined') {
      const fullText = translatedMessage ? `${translatedTitle}\n\n${translatedMessage}` : translatedTitle;
      const actionButton = translatedButtons?.find((button) => button.style !== 'cancel');
      const cancelButton = translatedButtons?.find((button) => button.style === 'cancel');
      if (translatedButtons && translatedButtons.length > 1 && actionButton && typeof globalThis.window.confirm === 'function') {
        if (globalThis.window.confirm(fullText)) {
          actionButton.onPress?.();
        } else {
          cancelButton?.onPress?.();
        }
        return;
      }
      if (typeof globalThis.window.alert === 'function') {
        globalThis.window.alert(fullText);
        translatedButtons?.[0]?.onPress?.();
        return;
      }
    }

    RN.Alert.alert(translatedTitle, translatedMessage, translatedButtons, options);
  },
};

// Keep all other React Native exports available to existing screens.
export * from 'react-native';
export * from 'react-native-safe-area-context';
