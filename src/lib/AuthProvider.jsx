import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api';
import { AuthContext } from './session';

/**
 * Session state for the whole site: who is signed in and which organisations
 * (with role, status, seats and sites) they belong to. `me` is null when
 * signed out, undefined while loading.
 */
export default function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/v1/auth/me');
      setMe(data);
      return data;
    } catch (e) {
      if (e.status !== 401) console.warn('[sparshika] could not load session:', e.message);
      setMe(null);
      return null;
    }
  }, []);

  // Re-check the session on every page change and when the tab regains focus,
  // so approvals, role changes and new sites show up without a reload.
  const { pathname } = useLocation();
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    refresh();
  }, [pathname, refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > 5000) {
        last.current = Date.now();
        refresh();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api('/api/v1/auth/logout', { method: 'POST' }); } catch { /* already signed out */ }
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, refresh, logout }), [me, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
