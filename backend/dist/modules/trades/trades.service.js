import { db } from '../../config/database.js';
import { trades } from '../../db/schema/trades.js';
/** Safely convert any date value to ISO string */
function toISOString(val) {
    if (val === null || val === undefined)
        return null;
    // postgres.js returns Date objects for timestamptz
    try {
        if (val instanceof Date)
            return val.toISOString();
        if (typeof val === 'string')
            return val;
        if (typeof val === 'number')
            return new Date(val).toISOString();
        if (typeof val?.toISOString === 'function')
            return val.toISOString();
        return String(val);
    }
    catch {
        return null;
    }
}
import { eq, and, count, sql } from 'drizzle-orm';
import { paginate, paginatedResponse } from '../../lib/pagination.js';
/** Fetch arena BUY/SELL trades from decisionLog JSONB — single query */
async function getArenaTrades(userId, limit) {
    try {
        const rows = await db.execute(sql `
      SELECT
        ag.id || '-' || COALESCE(d->>'time', '') as id,
        COALESCE(d->>'symbol', 'N/A') as symbol,
        d->>'action' as side,
        '0' as amount,
        COALESCE(d->>'price', '0') as price,
        NULL as total_value,
        NULL as pnl,
        NULL as pnl_percent,
        true as is_paper,
        COALESCE(d->>'reasoning', 'Arena trade') as reasoning,
        'filled' as status,
        d->>'time' as decision_time,
        ars.started_at as session_started,
        'arena' as mode,
        b.id as bot_id,
        b.name as bot_name,
        b.avatar_color as bot_avatar_color,
        b.avatar_letter as bot_avatar_letter
      FROM arena_sessions ars
      JOIN arena_gladiators ag ON ag.session_id = ars.id
      JOIN bots b ON ag.bot_id = b.id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ag.decision_log) = 'array' THEN ag.decision_log ELSE '[]'::jsonb END
      ) AS d
      WHERE ars.user_id = ${userId}
        AND d->>'action' IN ('BUY', 'SELL')
      ORDER BY COALESCE(d->>'time', ars.started_at::text) DESC
      LIMIT ${limit}
    `);
        return rows.map(r => ({
            id: r.id,
            symbol: r.symbol,
            side: r.side,
            amount: r.amount,
            price: r.price,
            totalValue: r.total_value,
            pnl: r.pnl,
            pnlPercent: r.pnl_percent,
            isPaper: true,
            reasoning: r.reasoning,
            status: 'filled',
            executedAt: r.decision_time || toISOString(r.session_started) || null,
            mode: 'arena',
            botId: r.bot_id,
            botName: r.bot_name ?? 'Arena Bot',
            botAvatarColor: r.bot_avatar_color,
            botAvatarLetter: r.bot_avatar_letter,
            isOwned: true,
        }));
    }
    catch (err) {
        console.warn('[Trades] Arena query failed:', err.message);
        return [];
    }
}
export async function getRecentTrades(userId, limit = 10) {
    const rows = await db.execute(sql `
    SELECT
      t.id, t.symbol, t.side, t.amount, t.price, t.total_value,
      t.pnl, t.pnl_percent, t.is_paper, t.reasoning, t.status,
      to_char(COALESCE(t.executed_at, t.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as executed_at_str,
      t.shadow_session_id, t.bot_subscription_id,
      COALESCE(b1.id, b2.id) as bot_id,
      COALESCE(b1.name, b2.name) as bot_name,
      COALESCE(b1.avatar_color, b2.avatar_color) as bot_avatar_color,
      COALESCE(b1.avatar_letter, b2.avatar_letter) as bot_avatar_letter,
      CASE
        WHEN t.is_paper = false AND t.bot_subscription_id IS NOT NULL THEN 'live'
        WHEN t.shadow_session_id IS NOT NULL THEN 'shadow'
        WHEN t.is_paper = true THEN 'paper'
        ELSE 'live'
      END as mode
    FROM trades t
    LEFT JOIN bot_subscriptions bs ON t.bot_subscription_id = bs.id
    LEFT JOIN bots b1 ON bs.bot_id = b1.id
    LEFT JOIN shadow_sessions ss ON t.shadow_session_id = ss.id
    LEFT JOIN bots b2 ON ss.bot_id = b2.id
    WHERE t.user_id = ${userId}
      AND t.status NOT IN ('failed', 'cancelled')
    ORDER BY t.executed_at DESC
    LIMIT ${limit}
  `);
    const regularTrades = rows.map(r => ({
        id: r.id, symbol: r.symbol, side: r.side, amount: r.amount, price: r.price,
        totalValue: r.total_value, pnl: r.pnl, pnlPercent: r.pnl_percent,
        isPaper: r.is_paper, reasoning: r.reasoning, status: r.status,
        executedAt: r.executed_at_str, mode: r.mode ?? 'live',
        botId: r.bot_id, botName: r.bot_name ?? 'Bot',
        botAvatarColor: r.bot_avatar_color, botAvatarLetter: r.bot_avatar_letter,
        isOwned: true,
    }));
    // Merge arena trades and return all sorted by time
    const arenaTrades = await getArenaTrades(userId, limit);
    return [...regularTrades, ...arenaTrades]
        .sort((a, b) => new Date(b.executedAt || 0).getTime() - new Date(a.executedAt || 0).getTime())
        .slice(0, limit);
}
export async function getTradeHistory(userId, filters) {
    const { page, limit: lim } = filters;
    const paginationParams = { page, limit: lim };
    const { limit: take, offset } = paginate(paginationParams);
    // Use parameterized queries (safe from SQL injection)
    // Always exclude failed/cancelled trades from history
    const conditions = [
        sql `t.user_id = ${userId}`,
        sql `t.status NOT IN ('failed', 'cancelled')`,
    ];
    if (filters.symbol)
        conditions.push(sql `t.symbol = ${filters.symbol}`);
    if (filters.side)
        conditions.push(sql `t.side = ${filters.side}`);
    if (filters.mode === 'live')
        conditions.push(sql `t.is_paper = false AND t.bot_subscription_id IS NOT NULL`);
    else if (filters.mode === 'shadow')
        conditions.push(sql `t.shadow_session_id IS NOT NULL`);
    else if (filters.is_paper !== undefined)
        conditions.push(sql `t.is_paper = ${filters.is_paper === 'true'}`);
    const whereSQL = conditions.length === 1
        ? conditions[0]
        : sql.join(conditions, sql ` AND `);
    // Count (excluding failed/cancelled)
    const [countResult] = await db
        .select({ total: count() })
        .from(trades)
        .where(and(eq(trades.userId, userId), sql `${trades.status} NOT IN ('failed', 'cancelled')`, ...(filters.mode === 'live' ? [eq(trades.isPaper, false)] : []), ...(filters.mode === 'shadow' ? [sql `${trades.shadowSessionId} IS NOT NULL`] : [])));
    const regularTotal = countResult?.total ?? 0;
    // Fetch regular trades
    const rows = await db.execute(sql `
    SELECT
      t.id, t.symbol, t.side, t.amount, t.price, t.total_value,
      t.pnl, t.pnl_percent, t.is_paper, t.reasoning, t.status,
      to_char(COALESCE(t.executed_at, t.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as executed_at_str,
      t.shadow_session_id, t.bot_subscription_id,
      COALESCE(b1.id, b2.id) as bot_id,
      COALESCE(b1.name, b2.name) as bot_name,
      COALESCE(b1.avatar_color, b2.avatar_color) as bot_avatar_color,
      COALESCE(b1.avatar_letter, b2.avatar_letter) as bot_avatar_letter,
      CASE
        WHEN t.is_paper = false AND t.bot_subscription_id IS NOT NULL THEN 'live'
        WHEN t.shadow_session_id IS NOT NULL THEN 'shadow'
        WHEN t.is_paper = true THEN 'paper'
        ELSE 'live'
      END as mode
    FROM trades t
    LEFT JOIN bot_subscriptions bs ON t.bot_subscription_id = bs.id
    LEFT JOIN bots b1 ON bs.bot_id = b1.id
    LEFT JOIN shadow_sessions ss ON t.shadow_session_id = ss.id
    LEFT JOIN bots b2 ON ss.bot_id = b2.id
    WHERE ${whereSQL}
    ORDER BY t.executed_at DESC
    LIMIT ${take} OFFSET ${offset}
  `);
    const enriched = rows.map(r => ({
        id: r.id, symbol: r.symbol, side: r.side, amount: r.amount, price: r.price,
        totalValue: r.total_value, pnl: r.pnl, pnlPercent: r.pnl_percent,
        isPaper: r.is_paper, reasoning: r.reasoning, status: r.status,
        executedAt: r.executed_at_str, mode: r.mode ?? 'live',
        botId: r.bot_id, botName: r.bot_name ?? 'Bot',
        botAvatarColor: r.bot_avatar_color, botAvatarLetter: r.bot_avatar_letter,
        isOwned: true,
    }));
    // For arena mode or 'all' — merge arena trades
    if (!filters.mode || filters.mode === 'all' || filters.mode === 'arena') {
        const arenaOnly = filters.mode === 'arena';
        const arenaTrades = await getArenaTrades(userId, 200); // fetch all arena trades
        const arenaCount = arenaTrades.length;
        if (arenaOnly) {
            // Only show arena trades
            const paged = arenaTrades.slice(offset, offset + take);
            return paginatedResponse(paged, arenaCount, paginationParams);
        }
        // Merge: combine regular + arena, sort, paginate
        const allTrades = [...enriched, ...arenaTrades]
            .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
        // For page 1, just take first `take` items from merged list
        // Total = regular count + arena count
        const paged = allTrades.slice(0, take);
        return paginatedResponse(paged, regularTotal + arenaCount, paginationParams);
    }
    return paginatedResponse(enriched, regularTotal, paginationParams);
}
