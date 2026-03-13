import { eq, sql, desc, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { investorProfiles } from '../../db/schema/investor-profiles.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { activityLog } from '../../db/schema/training.js';
import { notificationSettings } from '../../db/schema/notifications.js';
import { NotFoundError } from '../../lib/errors.js';
import type { UpdateProfileBody, UpdateSettingsBody } from './user.schema.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeRiskLevel(riskTolerance: number): 'conservative' | 'moderate' | 'aggressive' {
  if (riskTolerance <= 33) return 'conservative';
  if (riskTolerance <= 66) return 'moderate';
  return 'aggressive';
}

// ─── Investor Quiz ──────────────────────────────────────────────────────────

export async function saveQuizResults(
  userId: string,
  data: { riskTolerance: number; investmentGoal?: string; timeHorizon?: string },
) {
  // Check if user exists
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError('User');

  const riskLevel = computeRiskLevel(data.riskTolerance);

  // Upsert investor profile
  const [existing] = await db
    .select({ id: investorProfiles.id })
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1);

  let profile;
  if (existing) {
    [profile] = await db
      .update(investorProfiles)
      .set({
        riskTolerance: data.riskTolerance,
        riskLevel,
        investmentGoal: data.investmentGoal,
        timeHorizon: data.timeHorizon,
        updatedAt: new Date(),
      })
      .where(eq(investorProfiles.userId, userId))
      .returning();
  } else {
    [profile] = await db
      .insert(investorProfiles)
      .values({
        userId,
        riskTolerance: data.riskTolerance,
        riskLevel,
        investmentGoal: data.investmentGoal,
        timeHorizon: data.timeHorizon,
      })
      .returning();
  }

  // Also update users table for backward compat + mark onboarding complete
  await db
    .update(users)
    .set({
      riskTolerance: data.riskTolerance,
      investmentGoal: data.investmentGoal,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return {
    id: user.id,
    riskTolerance: profile.riskTolerance,
    riskLevel: profile.riskLevel,
    investmentGoal: profile.investmentGoal,
    timeHorizon: profile.timeHorizon,
    onboardingComplete: true,
  };
}

// ─── Get Investor Profile ───────────────────────────────────────────────────

export async function getInvestorProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1);

  return profile || null;
}

// ─── Referral ───────────────────────────────────────────────────────────────

export async function getReferralInfo(userId: string) {
  const [user] = await db
    .select({
      referralCode: users.referralCode,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('User');

  // Count referrals
  const [refCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.referredBy, userId));

  return {
    referralCode: user.referralCode,
    referralLink: `https://bottrade.app/invite/${user.referralCode}`,
    totalReferred: refCount?.count ?? 0,
    totalEarned: 0, // Placeholder - would need a referral earnings table
    activeReferrals: refCount?.count ?? 0,
  };
}

export async function getProfile(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
      riskTolerance: users.riskTolerance,
      investmentGoal: users.investmentGoal,
      referralCode: users.referralCode,
      onboardingComplete: users.onboardingComplete,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
}

export async function updateProfile(userId: string, data: UpdateProfileBody) {
  const updateFields: Record<string, unknown> = {};

  if (data.name !== undefined) updateFields.name = data.name;
  if (data.risk_tolerance !== undefined) updateFields.riskTolerance = data.risk_tolerance;
  if (data.investment_goal !== undefined) updateFields.investmentGoal = data.investment_goal;
  if (data.avatar_color !== undefined) updateFields.avatarColor = data.avatar_color;
  if (data.avatar_initials !== undefined) updateFields.avatarInitials = data.avatar_initials;

  if (Object.keys(updateFields).length === 0) {
    return getProfile(userId);
  }

  updateFields.updatedAt = new Date();

  const [updated] = await db
    .update(users)
    .set(updateFields)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
      riskTolerance: users.riskTolerance,
      investmentGoal: users.investmentGoal,
      referralCode: users.referralCode,
      onboardingComplete: users.onboardingComplete,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!updated) {
    throw new NotFoundError('User');
  }

  return updated;
}

export async function getWallet(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User');
  }

  // Sum of exchange balances
  const [balanceResult] = await db
    .select({
      totalBalance: sql<string>`COALESCE(SUM(${exchangeConnections.totalBalance}), 0)`,
    })
    .from(exchangeConnections)
    .where(eq(exchangeConnections.userId, userId));

  // Recent activity
  const recentActivity = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt))
    .limit(10);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    totalBalance: balanceResult?.totalBalance || '0',
    recentActivity,
  };
}

export async function getActivity(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ total: count() })
    .from(activityLog)
    .where(eq(activityLog.userId, userId));

  const items = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items,
    pagination: {
      page,
      limit,
      total: totalResult?.total || 0,
      totalPages: Math.ceil((totalResult?.total || 0) / limit),
    },
  };
}

export async function getSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);

  if (settings) {
    return settings;
  }

  // Create default settings if not exists
  const [newSettings] = await db
    .insert(notificationSettings)
    .values({ userId })
    .returning();

  return newSettings;
}

export async function updateSettings(userId: string, data: UpdateSettingsBody) {
  const updateFields: Record<string, unknown> = {};

  if (data.trade_alerts !== undefined) updateFields.tradeAlerts = data.trade_alerts;
  if (data.system_updates !== undefined) updateFields.systemUpdates = data.system_updates;
  if (data.price_alerts !== undefined) updateFields.priceAlerts = data.price_alerts;
  if (data.push_enabled !== undefined) updateFields.pushEnabled = data.push_enabled;
  if (data.email_enabled !== undefined) updateFields.emailEnabled = data.email_enabled;

  updateFields.updatedAt = new Date();

  // Upsert: try update first, insert if not exists
  const [existing] = await db
    .select({ id: notificationSettings.id })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notificationSettings)
      .set(updateFields)
      .where(eq(notificationSettings.userId, userId))
      .returning();

    return updated;
  }

  // Insert with the provided values merged with defaults
  const [created] = await db
    .insert(notificationSettings)
    .values({
      userId,
      ...updateFields,
    })
    .returning();

  return created;
}
