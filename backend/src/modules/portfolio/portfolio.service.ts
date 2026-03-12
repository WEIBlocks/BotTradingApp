import { db } from '../../config/database.js';
import { exchangeConnections, exchangeAssets } from '../../db/schema/exchanges.js';
import { eq, sql } from 'drizzle-orm';

export async function getSummary(userId: string) {
  const [result] = await db
    .select({
      totalValue: sql<string>`COALESCE(SUM(${exchangeAssets.valueUsd}::numeric), 0)`,
      change24h: sql<string>`COALESCE(
        SUM(${exchangeAssets.valueUsd}::numeric * ${exchangeAssets.change24h}::numeric / 100), 0
      )`,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(eq(exchangeConnections.userId, userId));

  const totalValue = parseFloat(result?.totalValue ?? '0');
  const change24hValue = parseFloat(result?.change24h ?? '0');
  const change24hPercent = totalValue > 0 ? (change24hValue / totalValue) * 100 : 0;

  return {
    totalValue: totalValue.toFixed(2),
    change24h: change24hValue.toFixed(2),
    change24hPercent: change24hPercent.toFixed(2),
  };
}

export async function getAssets(userId: string) {
  const rows = await db
    .select({
      id: exchangeAssets.id,
      symbol: exchangeAssets.symbol,
      name: exchangeAssets.name,
      amount: exchangeAssets.amount,
      valueUsd: exchangeAssets.valueUsd,
      change24h: exchangeAssets.change24h,
      allocation: exchangeAssets.allocation,
      iconColor: exchangeAssets.iconColor,
      provider: exchangeConnections.provider,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(eq(exchangeConnections.userId, userId));

  return rows;
}

export async function getAllocation(userId: string) {
  const rows = await db
    .select({
      symbol: exchangeAssets.symbol,
      name: exchangeAssets.name,
      totalValue: sql<string>`SUM(${exchangeAssets.valueUsd}::numeric)`,
      iconColor: exchangeAssets.iconColor,
    })
    .from(exchangeAssets)
    .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id))
    .where(eq(exchangeConnections.userId, userId))
    .groupBy(exchangeAssets.symbol, exchangeAssets.name, exchangeAssets.iconColor);

  // Calculate total for percentage
  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.totalValue ?? '0'), 0);

  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    value: parseFloat(r.totalValue ?? '0').toFixed(2),
    percentage: grandTotal > 0
      ? ((parseFloat(r.totalValue ?? '0') / grandTotal) * 100).toFixed(2)
      : '0.00',
    iconColor: r.iconColor,
  }));
}
