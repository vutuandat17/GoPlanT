import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'goplant.access-token';
const REFRESH_TOKEN_KEY = 'goplant.refresh-token';

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function saveKey(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function clearKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function readAccessToken() { return readKey(ACCESS_TOKEN_KEY); }
export function saveAccessToken(token: string) { return saveKey(ACCESS_TOKEN_KEY, token); }
export function clearAccessToken() { return clearKey(ACCESS_TOKEN_KEY); }

export function readRefreshToken() { return readKey(REFRESH_TOKEN_KEY); }
export function saveRefreshToken(token: string) { return saveKey(REFRESH_TOKEN_KEY, token); }
export function clearRefreshToken() { return clearKey(REFRESH_TOKEN_KEY); }

export async function clearSessionTokens() {
  await Promise.all([clearAccessToken(), clearRefreshToken()]);
}
