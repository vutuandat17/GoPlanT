import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { MockAuthUser } from '@/services/mockAuth';

type AuthSessionValue = {
  user: MockAuthUser | null;
  signIn: (user: MockAuthUser) => void;
  signOut: () => void;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockAuthUser | null>(null);
  const value = useMemo(() => ({ user, signIn: setUser, signOut: () => setUser(null) }), [user]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used inside AuthSessionProvider');
  return context;
}
