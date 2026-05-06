import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {favoritesApi} from '../services/favorites';
import {useAuth} from './AuthContext';
import type {Bot} from '../types';

// Single source of truth for the current user's favorited bot ids and the full
// list of favorited bots. Heart icons across the app subscribe via `isFavorite`
// and call `toggle` for an optimistic update; the marketplace tab and the
// dashboard section render `favorites` directly.

interface FavoritesContextValue {
  favorites: Bot[];
  ids: Set<string>;
  loading: boolean;
  isFavorite: (botId: string) => boolean;
  toggle: (botId: string, bot?: Bot) => Promise<boolean>; // resolves to the new state
  refresh: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favorites: [],
  ids: new Set(),
  loading: false,
  isFavorite: () => false,
  toggle: async () => false,
  refresh: async () => {},
});

export function FavoritesProvider({children}: {children: React.ReactNode}) {
  const {user} = useAuth();
  const [favorites, setFavorites] = useState<Bot[]>([]);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  // Avoid spamming the server when many heart-icons mount simultaneously.
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setFavorites([]);
      setIds(new Set());
      return;
    }
    if (inflight.current) return inflight.current;
    setLoading(true);
    const p = (async () => {
      try {
        const list = await favoritesApi.list();
        setFavorites(list);
        setIds(new Set(list.map(b => b.id)));
      } catch {
        // Silent — UI falls back to empty + heart icons stay disabled-correct.
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, [user?.id]);

  // Initial fetch on login / user change.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const isFavorite = useCallback((botId: string) => ids.has(botId), [ids]);

  // Optimistic toggle: flip local state immediately, call API, revert on error.
  // Pass the full `bot` if you have it — that lets the dashboard/marketplace
  // show the new entry instantly without waiting for refresh().
  const toggle = useCallback(
    async (botId: string, bot?: Bot): Promise<boolean> => {
      const wasFav = ids.has(botId);
      // Optimistic update
      const nextIds = new Set(ids);
      if (wasFav) nextIds.delete(botId);
      else nextIds.add(botId);
      setIds(nextIds);
      setFavorites(prev => {
        if (wasFav) return prev.filter(b => b.id !== botId);
        if (bot && !prev.some(b => b.id === botId)) return [bot, ...prev];
        return prev;
      });
      try {
        if (wasFav) await favoritesApi.remove(botId);
        else await favoritesApi.add(botId);
        // For add-without-bot-payload, refresh once to pull the full enriched row.
        if (!wasFav && !bot) refresh();
        return !wasFav;
      } catch (e) {
        // Revert
        setIds(ids);
        setFavorites(prev => prev);
        refresh(); // pull authoritative state
        throw e;
      }
    },
    [ids, refresh],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({favorites, ids, loading, isFavorite, toggle, refresh}),
    [favorites, ids, loading, isFavorite, toggle, refresh],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
