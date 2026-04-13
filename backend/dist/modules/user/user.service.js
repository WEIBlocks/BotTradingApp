import { eq, sql, desc, count, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { users } from '../../db/schema/users.js';
import { investorProfiles } from '../../db/schema/investor-profiles.js';
import { exchangeConnections } from '../../db/schema/exchanges.js';
import { botSubscriptions } from '../../db/schema/bots.js';
import { activityLog } from '../../db/schema/training.js';
import { notificationSettings } from '../../db/schema/notifications.js';
import { NotFoundError } from '../../lib/errors.js';
// ─── Helpers ────────────────────────────────────────────────────────────────
function computeRiskLevel(riskTolerance) {
    if (riskTolerance <= 33)
        return 'conservative';
    if (riskTolerance <= 66)
        return 'moderate';
    return 'aggressive';
}
// ─── Investor Quiz ──────────────────────────────────────────────────────────
export async function saveQuizResults(userId, data) {
    // Check if user exists
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user)
        throw new NotFoundError('User');
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
    }
    else {
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
export async function getInvestorProfile(userId) {
    const [profile] = await db
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.userId, userId))
        .limit(1);
    return profile || null;
}
// ─── Referral ───────────────────────────────────────────────────────────────
export async function getReferralInfo(userId) {
    const [user] = await db
        .select({
        referralCode: users.referralCode,
    })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user)
        throw new NotFoundError('User');
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
export async function getProfile(userId) {
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
        googleId: users.googleId,
        appleId: users.appleId,
        passwordHash: users.passwordHash,
    })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user) {
        throw new NotFoundError('User');
    }
    // Derive auth provider and strip sensitive fields
    const authProvider = user.googleId ? 'google' : user.appleId ? 'apple' : 'email';
    const { googleId, appleId, passwordHash, ...safeUser } = user;
    return { ...safeUser, authProvider };
}
export async function updateProfile(userId, data) {
    const updateFields = {};
    if (data.name !== undefined)
        updateFields.name = data.name;
    if (data.risk_tolerance !== undefined)
        updateFields.riskTolerance = data.risk_tolerance;
    if (data.investment_goal !== undefined)
        updateFields.investmentGoal = data.investment_goal;
    if (data.avatar_color !== undefined)
        updateFields.avatarColor = data.avatar_color;
    if (data.avatar_initials !== undefined)
        updateFields.avatarInitials = data.avatar_initials;
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
export async function getWallet(userId) {
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
    // Per-exchange balances with provider + assetClass
    const exchangeRows = await db
        .select({
        id: exchangeConnections.id,
        provider: exchangeConnections.provider,
        assetClass: exchangeConnections.assetClass,
        totalBalance: exchangeConnections.totalBalance,
        status: exchangeConnections.status,
        sandbox: exchangeConnections.sandbox,
    })
        .from(exchangeConnections)
        .where(eq(exchangeConnections.userId, userId));
    // Capital locked per exchange: join subscriptions to their exchange connection
    const allocatedRows = await db
        .select({
        exchangeConnId: botSubscriptions.exchangeConnId,
        allocated: sql `COALESCE(SUM(${botSubscriptions.allocatedAmount}::numeric), 0)`,
    })
        .from(botSubscriptions)
        .where(and(eq(botSubscriptions.userId, userId), eq(botSubscriptions.status, 'active'), eq(botSubscriptions.mode, 'live')))
        .groupBy(botSubscriptions.exchangeConnId);
    // Build per-exchange breakdown
    const allocatedByConn = new Map(allocatedRows.map(r => [r.exchangeConnId, parseFloat(r.allocated)]));
    const exchanges = exchangeRows.map(ex => {
        const balance = parseFloat(ex.totalBalance || '0');
        const locked = allocatedByConn.get(ex.id) ?? 0;
        const bp = Math.max(0, balance - locked);
        return {
            provider: ex.provider,
            assetClass: ex.assetClass, // 'crypto' | 'stocks'
            totalBalance: balance.toFixed(2),
            allocatedCapital: locked.toFixed(2),
            buyingPower: bp.toFixed(2),
            sandbox: ex.sandbox ?? false,
            status: ex.status,
        };
    });
    const totalBalance = exchanges.reduce((s, e) => s + parseFloat(e.totalBalance), 0);
    const totalAllocated = exchanges.reduce((s, e) => s + parseFloat(e.allocatedCapital), 0);
    const totalBuyingPower = Math.max(0, totalBalance - totalAllocated);
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
        totalBalance: totalBalance.toFixed(2),
        allocatedCapital: totalAllocated.toFixed(2),
        buyingPower: totalBuyingPower.toFixed(2),
        exchanges, // per-exchange breakdown
        recentActivity,
    };
}
export async function getActivity(userId, page, limit) {
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
export async function getSettings(userId) {
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
export async function updateSettings(userId, data) {
    const updateFields = {};
    if (data.trade_alerts !== undefined)
        updateFields.tradeAlerts = data.trade_alerts;
    if (data.system_updates !== undefined)
        updateFields.systemUpdates = data.system_updates;
    if (data.price_alerts !== undefined)
        updateFields.priceAlerts = data.price_alerts;
    if (data.push_enabled !== undefined)
        updateFields.pushEnabled = data.push_enabled;
    if (data.email_enabled !== undefined)
        updateFields.emailEnabled = data.email_enabled;
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
