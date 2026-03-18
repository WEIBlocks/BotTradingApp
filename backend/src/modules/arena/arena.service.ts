import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { arenaSessions, arenaGladiators } from '../../db/schema/arena.js';
import { bots, botStatistics } from '../../db/schema/bots.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';

export async function getAvailableBots() {
  const rows = await db
    .select({
      id: bots.id,
      name: bots.name,
      subtitle: bots.subtitle,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      avatarColor: bots.avatarColor,
      avatarLetter: bots.avatarLetter,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      avgRating: botStatistics.avgRating,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.isPublished, true));

  return rows;
}

export async function createSession(
  userId: string,
  botIds: string[],
  durationSeconds: number = 180,
) {
  // Prevent duplicate running arena sessions
  const [existingSession] = await db
    .select()
    .from(arenaSessions)
    .where(
      and(
        eq(arenaSessions.userId, userId),
        eq(arenaSessions.status, 'running'),
      ),
    )
    .limit(1);

  if (existingSession) {
    throw new ConflictError('You already have an active arena session running');
  }

  // Validate that all bots exist
  for (const botId of botIds) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      throw new NotFoundError(`Bot ${botId}`);
    }
  }

  const [session] = await db
    .insert(arenaSessions)
    .values({
      userId,
      status: 'running',
      durationSeconds,
      startedAt: new Date(),
    })
    .returning();

  // Insert gladiators with initial $10,000 balance
  const gladiatorValues = botIds.map((botId) => ({
    sessionId: session.id,
    botId,
    equityData: [10_000] as number[],
  }));

  const gladiators = await db
    .insert(arenaGladiators)
    .values(gladiatorValues)
    .returning();

  return { ...session, gladiators };
}

export async function getSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(arenaSessions)
    .where(
      and(
        eq(arenaSessions.id, sessionId),
        eq(arenaSessions.userId, userId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError('Arena session');
  }

  const gladiators = await db
    .select({
      id: arenaGladiators.id,
      botId: arenaGladiators.botId,
      rank: arenaGladiators.rank,
      finalReturn: arenaGladiators.finalReturn,
      winRate: arenaGladiators.winRate,
      equityData: arenaGladiators.equityData,
      isWinner: arenaGladiators.isWinner,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botAvatar: bots.avatarLetter,
      botColor: bots.avatarColor,
      botRiskLevel: bots.riskLevel,
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  // Calculate elapsed time and progress
  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const elapsed = (Date.now() - startedAt) / 1000;
  const duration = session.durationSeconds ?? 180;
  const progress = Math.min(elapsed / duration, 1);

  return {
    ...session,
    gladiators,
    progress,
    elapsedSeconds: Math.floor(elapsed),
    remainingSeconds: Math.max(0, Math.floor(duration - elapsed)),
  };
}

export async function getActiveSession(userId: string) {
  const [session] = await db
    .select()
    .from(arenaSessions)
    .where(
      and(
        eq(arenaSessions.userId, userId),
        eq(arenaSessions.status, 'running'),
      ),
    )
    .orderBy(desc(arenaSessions.startedAt))
    .limit(1);

  if (!session) return null;

  const gladiators = await db
    .select({
      id: arenaGladiators.id,
      botId: arenaGladiators.botId,
      rank: arenaGladiators.rank,
      finalReturn: arenaGladiators.finalReturn,
      winRate: arenaGladiators.winRate,
      equityData: arenaGladiators.equityData,
      isWinner: arenaGladiators.isWinner,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botAvatar: bots.avatarLetter,
      botColor: bots.avatarColor,
      botRiskLevel: bots.riskLevel,
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, session.id));

  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const elapsed = (Date.now() - startedAt) / 1000;
  const duration = session.durationSeconds ?? 180;
  const progress = Math.min(elapsed / duration, 1);

  return {
    ...session,
    gladiators,
    progress,
    elapsedSeconds: Math.floor(elapsed),
    remainingSeconds: Math.max(0, Math.floor(duration - elapsed)),
  };
}

export async function getHistory(userId: string) {
  const sessions = await db
    .select()
    .from(arenaSessions)
    .where(eq(arenaSessions.userId, userId))
    .orderBy(desc(arenaSessions.startedAt))
    .limit(20);

  // For each session, get gladiator summary
  const results = await Promise.all(
    sessions.map(async (session) => {
      const gladiators = await db
        .select({
          botId: arenaGladiators.botId,
          rank: arenaGladiators.rank,
          finalReturn: arenaGladiators.finalReturn,
          isWinner: arenaGladiators.isWinner,
          botName: bots.name,
          botColor: bots.avatarColor,
        })
        .from(arenaGladiators)
        .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
        .where(eq(arenaGladiators.sessionId, session.id));

      const winner = gladiators.find((g) => g.isWinner) ||
        gladiators.sort((a, b) => parseFloat(b.finalReturn ?? '0') - parseFloat(a.finalReturn ?? '0'))[0] || null;

      return {
        id: session.id,
        status: session.status,
        durationSeconds: session.durationSeconds,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        botCount: gladiators.length,
        winnerName: winner?.botName ?? null,
        winnerReturn: winner?.finalReturn ?? null,
        winnerColor: winner?.botColor ?? null,
      };
    }),
  );

  return results;
}

export async function getSessionResults(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(arenaSessions)
    .where(
      and(
        eq(arenaSessions.id, sessionId),
        eq(arenaSessions.userId, userId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError('Arena session');
  }

  const gladiators = await db
    .select({
      id: arenaGladiators.id,
      botId: arenaGladiators.botId,
      rank: arenaGladiators.rank,
      finalReturn: arenaGladiators.finalReturn,
      winRate: arenaGladiators.winRate,
      equityData: arenaGladiators.equityData,
      isWinner: arenaGladiators.isWinner,
      botName: bots.name,
      botSubtitle: bots.subtitle,
      botStrategy: bots.strategy,
      botAvatar: bots.avatarLetter,
      botColor: bots.avatarColor,
      botRiskLevel: bots.riskLevel,
    })
    .from(arenaGladiators)
    .innerJoin(bots, eq(arenaGladiators.botId, bots.id))
    .where(eq(arenaGladiators.sessionId, sessionId));

  // Sort by rank (ascending) or finalReturn (descending)
  const ranked = gladiators.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    const aReturn = a.finalReturn ? parseFloat(a.finalReturn) : 0;
    const bReturn = b.finalReturn ? parseFloat(b.finalReturn) : 0;
    return bReturn - aReturn;
  });

  const winner = ranked.find((g) => g.isWinner) || ranked[0] || null;

  return {
    session: {
      id: session.id,
      status: session.status,
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt,
    },
    winner,
    rankings: ranked,
    totalGladiators: ranked.length,
  };
}
