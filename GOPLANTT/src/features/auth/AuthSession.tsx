import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { apiRequest, isApiConfigured, type ApiUser } from '@/services/api';
import { clearAccessToken, readAccessToken, saveAccessToken } from '@/services/tokenStorage';

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
  signIn: (user: SessionUser, token?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        if (isApiConfigured) {
          const token = await readAccessToken();
          if (token) {
            const currentUser = await apiRequest<ApiUser>('/api/v1/auth/me', { token });
            if (mounted) {
              setAccessToken(token);
              setUser(mapApiUser(currentUser));
            }
          }
        }
      } catch {
        await clearAccessToken();
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
    signIn: async (nextUser: SessionUser, token?: string) => {
      if (token) await saveAccessToken(token);
      setAccessToken(token ?? null);
      setUser(nextUser);
    },
    signOut: async () => {
      await clearAccessToken();
      setAccessToken(null);
      setUser(null);
    },
  }), [user, accessToken, isReady]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used inside AuthSessionProvider');
  return context;
}
