import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore, ApiError } from './api';

export interface SessionUser {
  id: string;
  role: string;
  schoolId: string | null;
  schoolName?: string | null;
  schoolCode?: string | null;
  nameEn: string;
  nameNe?: string | null;
  username: string;
  email?: string | null;
  locale: string;
  status: string;
}

interface AuthValue {
  user: SessionUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** True when the user holds any of the given roles. */
  can: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Full client-side permission model mirroring the server RBAC. */
export const ROLE_HOME: Record<string, string> = {
  super_admin: '/schools',
  school_admin: '/',
  accountant: '/finance',
  office: '/students',
  teacher: '/attendance',
  student: '/dashboard/student',
  parent: '/dashboard/parent',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!tokenStore.access && !tokenStore.refresh) {
        setReady(true);
        return;
      }
      try {
        // Hitting an auth-gated endpoint triggers a transparent refresh if needed
        const r = await api.get<{ user: SessionUser; school: { nameEn: string; code: string } | null }>('/auth/me');
        setUser({
          ...r.user,
          schoolName: r.school?.nameEn ?? null,
          schoolCode: r.school?.code ?? null,
        });
      } catch {
        tokenStore.clear();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      '/auth/login',
      { username, password },
    );
    tokenStore.set(data.accessToken, data.refreshToken);
    let profile = data.user;
    try {
      const r = await api.get<{ user: SessionUser; school: { nameEn: string; code: string } | null }>('/auth/me');
      profile = { ...r.user, schoolName: r.school?.nameEn ?? null, schoolCode: r.school?.code ?? null };
    } catch {
      /* fall back to login payload */
    }
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', { refreshToken: tokenStore.refresh });
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback(
    (...roles: string[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo(() => ({ user, ready, login, logout, can }), [user, ready, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
