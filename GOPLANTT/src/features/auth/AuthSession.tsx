import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  apiRequest,
  isApiConfigured,
  logoutAuthSession,
  refreshAuthSession,
  setTokenRefreshedListener,
  type ApiUser,
} from '@/services/api';
import {
  clearSessionTokens,
  readAccessToken,
  readRefreshToken,
  saveAccessToken,
  saveRefreshToken,
} from '@/services/tokenStorage';

export type SessionUser = { id: string; email: string; name: string; role: 'admin' | 'user' };
const mapApiUser = (user: ApiUser): SessionUser => ({
  id: user.id,
  email: user.email,
  name: user.displayName,
  role: user.roles.includes('admin') ? 'admin' : 'user',
});

type AuthSessionValue = {
  user: SessionUser | null;
  accessToken: string | null;
  isReady: boolean;
  signIn: (user: SessionUser, token?: string, refreshToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setTokenRefreshedListener((next) => {
      if (!next) {
        setAccessToken(null);
        setUser(null);
      } else {
        setAccessToken(next.accessToken);
        setUser(mapApiUser(next.user));
      }
    });
    return () => setTokenRefreshedListener(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        if (isApiConfigured) {
          const token = await readAccessToken();
          const refresh = await readRefreshToken();
          if (token) {
            try {
              const currentUser = await apiRequest<ApiUser>('/api/v1/auth/me', { token });
              if (mounted) {
                setAccessToken(token);
                setUser(mapApiUser(currentUser));
              }
              return;
            } catch {
              // Access token expired or invalid; fall through to refresh token attempt.
            }
          }
          if (refresh) {
            const next = await refreshAuthSession(refresh);
            await saveAccessToken(next.accessToken);
            if (next.refreshToken) await saveRefreshToken(next.refreshToken);
            if (mounted) {
              setAccessToken(next.accessToken);
              setUser(mapApiUser(next.user));
            }
          }
        }
      } catch {
        await clearSessionTokens();
      } finally {
        if (mounted) setIsReady(true);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    accessToken,
    isReady,
    signIn: async (nextUser: SessionUser, token?: string, refreshToken?: string) => {
      if (token) await saveAccessToken(token);
      if (refreshToken) await saveRefreshToken(refreshToken);
      setAccessToken(token ?? null);
      setUser(nextUser);
    },
    signOut: async () => {
      try {
        const refresh = await readRefreshToken();
        if (isApiConfigured && refresh) {
          await logoutAuthSession(refresh).catch(() => {});
        }
      } finally {
        await clearSessionTokens();
        setAccessToken(null);
        setUser(null);
      }
    },
    updateDisplayName: async (displayName: string) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập lại để cập nhật hồ sơ.');
      const updatedUser = await apiRequest<ApiUser>('/api/v1/auth/me', {
        method: 'PUT', token: accessToken, body: { displayName },
      });
      setUser(mapApiUser(updatedUser));
    },
  }), [user, accessToken, isReady]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used inside AuthSessionProvider');
  return context;
}
