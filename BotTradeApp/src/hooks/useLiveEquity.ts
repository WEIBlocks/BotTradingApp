/**
 * useLiveEquity — subscribes to your backend WebSocket for real-time equity updates.
 *
 * Usage (BotDetailsScreen):
 *   const { equityData, totalPnl } = useLiveEquity({ botId, initialData, initialPnl });
 *
 * Usage (DashboardScreen):
 *   const { equityData } = useLiveEquity({ initialData });
 *
 * - Seeds from whatever REST data you already fetched (no extra request)
 * - Backend emits "equity_update"   → { botId, equityData, totalPnl }
 * - Backend emits "portfolio_update" → { equityData, totalValue }
 * - On each event: appends the latest point + trims to last 200 points (prevents unbounded growth)
 * - Falls back gracefully if backend WS isn't running (just uses REST seed)
 */

import {useEffect, useRef, useState} from 'react';
import {wsService} from '../services/websocket';

interface UseLiveEquityOptions {
  botId?: string;           // If set: subscribes to bot-specific equity
  initialData: number[];    // Seed from your existing REST fetch
  initialPnl?: number;
}

interface LiveEquityState {
  equityData: number[];
  totalPnl:   number;
}

const MAX_POINTS = 200;

export function useLiveEquity({
  botId,
  initialData,
  initialPnl = 0,
}: UseLiveEquityOptions): LiveEquityState {

  const [equityData, setEquityData] = useState<number[]>(initialData);
  const [totalPnl,   setTotalPnl]   = useState(initialPnl);
  const dataRef = useRef<number[]>(initialData);

  // Sync when initial data changes (parent re-fetched from REST)
  useEffect(() => {
    dataRef.current = initialData;
    setEquityData(initialData);
  }, [initialData]);

  useEffect(() => {
    setTotalPnl(initialPnl);
  }, [initialPnl]);

  // ── Bot-specific equity stream ────────────────────────────────────────────
  useEffect(() => {
    if (!botId) return;

    const unsub = wsService.subscribe('equity_update', (payload: unknown) => {
      const p = payload as {botId?: string; equityData?: number[]; totalPnl?: number; newPoint?: number};
      if (p.botId !== botId) return; // ignore events for other bots

      if (Array.isArray(p.equityData) && p.equityData.length > 0) {
        // Full refresh from backend
        dataRef.current = p.equityData.slice(-MAX_POINTS);
        setEquityData([...dataRef.current]);
      } else if (typeof p.newPoint === 'number') {
        // Single new point — append
        const next = [...dataRef.current, p.newPoint].slice(-MAX_POINTS);
        dataRef.current = next;
        setEquityData([...next]);
      }

      if (typeof p.totalPnl === 'number') setTotalPnl(p.totalPnl);
    });

    return unsub;
  }, [botId]);

  // ── Portfolio equity stream (Dashboard, no botId) ─────────────────────────
  useEffect(() => {
    if (botId) return; // bot-specific hook handles this case above

    const unsub = wsService.subscribe('portfolio_update', (payload: unknown) => {
      const p = payload as {equityData?: number[]; totalValue?: number; newPoint?: number};

      if (Array.isArray(p.equityData) && p.equityData.length > 0) {
        dataRef.current = p.equityData.slice(-MAX_POINTS);
        setEquityData([...dataRef.current]);
      } else if (typeof p.newPoint === 'number') {
        const next = [...dataRef.current, p.newPoint].slice(-MAX_POINTS);
        dataRef.current = next;
        setEquityData([...next]);
      }
    });

    return unsub;
  }, [botId]);

  // ── Trade event → append new equity point ────────────────────────────────
  // When any trade fires we compute the new cumulative equity point
  useEffect(() => {
    const unsub = wsService.subscribe('trade', (payload: unknown) => {
      const p = payload as {botId?: string; pnl?: number; cumulativeEquity?: number};

      // Only update if this trade matches our context
      if (botId && p.botId !== botId) return;

      if (typeof p.cumulativeEquity === 'number') {
        const next = [...dataRef.current, p.cumulativeEquity].slice(-MAX_POINTS);
        dataRef.current = next;
        setEquityData([...next]);
        if (typeof p.pnl === 'number') {
          setTotalPnl(prev => prev + p.pnl!);
        }
      }
    });

    return unsub;
  }, [botId]);

  return {equityData, totalPnl};
}
