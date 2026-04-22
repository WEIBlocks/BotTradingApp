/**
 * useLiveEquity — subscribes to WebSocket for real-time equity updates.
 *
 * Live equity  → exchange portfolio snapshots (real money, exchange balances)
 * Shadow equity → cumulative PnL from paper/shadow bot sessions
 *
 * These are kept COMPLETELY SEPARATE so shadow paper trading never
 * distorts the live portfolio chart.
 *
 * Topics:
 *   "portfolio_update"     → live exchange equity { equityData?, newPoint?, totalValue }
 *   "equity_update"        → live bot equity      { botId, equityData?, newPoint?, totalPnl }
 *   "shadow_equity_update" → shadow equity        { sessionId, botId, newPoint, totalPnl, currentBalance }
 */

import {useEffect, useRef, useState} from 'react';
import {wsService} from '../services/websocket';

interface UseLiveEquityOptions {
  botId?: string;
  initialData: number[];
  initialPnl?: number;
  // Shadow equity seed (from REST fetch of /portfolio/equity-history)
  initialShadowData?: number[];
}

interface LiveEquityState {
  equityData: number[];       // live exchange equity
  totalPnl: number;
  shadowEquityData: number[]; // shadow/paper bot cumulative PnL curve
}

const MAX_POINTS = 200;

export function useLiveEquity({
  botId,
  initialData,
  initialPnl = 0,
  initialShadowData = [],
}: UseLiveEquityOptions): LiveEquityState {

  const [equityData, setEquityData] = useState<number[]>(initialData);
  const [totalPnl,   setTotalPnl]   = useState(initialPnl);
  const [shadowEquityData, setShadowEquityData] = useState<number[]>(initialShadowData);
  const dataRef       = useRef<number[]>(initialData);
  const shadowDataRef = useRef<number[]>(initialShadowData);

  // Sync when parent re-fetches REST data
  useEffect(() => {
    dataRef.current = initialData;
    setEquityData(initialData);
  }, [initialData]);

  useEffect(() => {
    setTotalPnl(initialPnl);
  }, [initialPnl]);

  useEffect(() => {
    shadowDataRef.current = initialShadowData;
    setShadowEquityData(initialShadowData);
  }, [initialShadowData]);

  // ── Bot-specific live equity stream ─────────────────────────────────────
  useEffect(() => {
    if (!botId) return;

    const unsub = wsService.subscribe('equity_update', (payload: unknown) => {
      const p = payload as {botId?: string; equityData?: number[]; totalPnl?: number; newPoint?: number};
      if (p.botId !== botId) return;

      if (Array.isArray(p.equityData) && p.equityData.length > 0) {
        dataRef.current = p.equityData.slice(-MAX_POINTS);
        setEquityData([...dataRef.current]);
      } else if (typeof p.newPoint === 'number') {
        const next = [...dataRef.current, p.newPoint].slice(-MAX_POINTS);
        dataRef.current = next;
        setEquityData([...next]);
      }

      if (typeof p.totalPnl === 'number') setTotalPnl(p.totalPnl);
    });

    return unsub;
  }, [botId]);

  // ── Live portfolio equity stream (Dashboard, no botId) ──────────────────
  useEffect(() => {
    if (botId) return;

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

  // ── Shadow equity stream — NEVER mixed with live ─────────────────────────
  useEffect(() => {
    if (botId) return; // bot-specific view doesn't need shadow stream

    const unsub = wsService.subscribe('shadow_equity_update', (payload: unknown) => {
      const p = payload as {newPoint?: number; totalPnl?: number; currentBalance?: number};

      if (typeof p.newPoint === 'number') {
        const next = [...shadowDataRef.current, p.newPoint].slice(-MAX_POINTS);
        shadowDataRef.current = next;
        setShadowEquityData([...next]);
      }
    });

    return unsub;
  }, [botId]);

  // ── Live trade event → append live equity point ──────────────────────────
  useEffect(() => {
    const unsub = wsService.subscribe('trade', (payload: unknown) => {
      const p = payload as {botId?: string; pnl?: number; cumulativeEquity?: number; isPaper?: boolean};

      // Paper/shadow trades must NOT update the live equity curve
      if (p.isPaper) return;
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

  return {equityData, totalPnl, shadowEquityData};
}
