import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { db } from '../../config/database.js';
import { users, refreshTokens } from '../../db/schema/users.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { ConflictError, UnauthorizedError, AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}
function parseRefreshExpiry() {
    const value = env.JWT_REFRESH_EXPIRES_IN;
    const match = value.match(/^(\d+)(s|m|h|d)$/);
    if (!match)
        return new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const num = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    if (unit === 's')
        ms = num * 1000;
    else if (unit === 'm')
        ms = num * 60 * 1000;
    else if (unit === 'h')
        ms = num * 3600 * 1000;
    else if (unit === 'd')
        ms = num * 86400 * 1000;
    return new Date(Date.now() + ms);
}
async function createTokenPair(userId, role) {
    const accessToken = signAccessToken({ userId, role });
    const rawRefreshToken = signRefreshToken({ userId, role });
    const tokenHash = await bcrypt.hash(rawRefreshToken, 10);
    await db.insert(refreshTokens).values({
        userId,
        tokenHash,
        expiresAt: parseRefreshExpiry(),
    });
    return { accessToken, refreshToken: rawRefreshToken };
}
function makeInitials(name) {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}
/**
 * Find-or-create a user from a social provider, return tokens.
 */
async function findOrCreateSocialUser(opts) {
    const { email, name, provider, providerId } = opts;
    const idField = provider === 'google' ? 'googleId' : 'appleId';
    // 1) Try to find by provider ID first
    const [byProvider] = await db
        .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        onboardingComplete: users.onboardingComplete,
    })
        .from(users)
        .where(eq(users[idField], providerId))
        .limit(1);
    if (byProvider) {
        if (!byProvider.isActive) {
            throw new UnauthorizedError('Account is deactivated');
        }
        const tokens = await createTokenPair(byProvider.id, byProvider.role);
        return {
            ...tokens,
            user: {
                id: byProvider.id,
                name: byProvider.name,
                email: byProvider.email,
                role: byProvider.role,
            },
            isNewUser: false,
            onboardingComplete: byProvider.onboardingComplete ?? false,
        };
    }
    // 2) Try to find by email — link the social account
    const [byEmail] = await db
        .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        onboardingComplete: users.onboardingComplete,
    })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
    if (byEmail) {
        if (!byEmail.isActive) {
            throw new UnauthorizedError('Account is deactivated');
        }
        // Link the social ID to existing account
        await db
            .update(users)
            .set({ [idField]: providerId, updatedAt: new Date() })
            .where(eq(users.id, byEmail.id));
        const tokens = await createTokenPair(byEmail.id, byEmail.role);
        return {
            ...tokens,
            user: {
                id: byEmail.id,
                name: byEmail.name,
                email: byEmail.email,
                role: byEmail.role,
            },
            isNewUser: false,
            onboardingComplete: byEmail.onboardingComplete ?? false,
        };
    }
    // 3) Create new user
    const referralCode = generateReferralCode();
    const initials = makeInitials(name || email.split('@')[0]);
    const [newUser] = await db
        .insert(users)
        .values({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        [idField]: providerId,
        referralCode,
        avatarInitials: initials,
        avatarColor: provider === 'google' ? '#4285F4' : '#000000',
    })
        .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
    });
    const tokens = await createTokenPair(newUser.id, newUser.role);
    return {
        ...tokens,
        user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
        },
        isNewUser: true,
        onboardingComplete: false,
    };
}
// ─── Email/Password Auth ─────────────────────────────────────────────────────
export async function register(name, email, password) {
    const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
    if (existing.length > 0) {
        throw new ConflictError('Email already registered');
    }
    const passwordHash = await hashPassword(password);
    const referralCode = generateReferralCode();
    const initials = makeInitials(name);
    const [newUser] = await db
        .insert(users)
        .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        referralCode,
        avatarInitials: initials,
        avatarColor: '#6C5CE7',
    })
        .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
    });
    const tokens = await createTokenPair(newUser.id, newUser.role);
    return {
        ...tokens,
        user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
        },
        isNewUser: true,
        onboardingComplete: false,
    };
}
export async function login(email, password) {
    const [user] = await db
        .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
        onboardingComplete: users.onboardingComplete,
    })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
    if (!user || !user.passwordHash) {
        throw new UnauthorizedError('Invalid email or password');
    }
    if (!user.isActive) {
        throw new UnauthorizedError('Account is deactivated');
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
        throw new UnauthorizedError('Invalid email or password');
    }
    const tokens = await createTokenPair(user.id, user.role);
    return {
        ...tokens,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
        isNewUser: false,
        onboardingComplete: user.onboardingComplete ?? false,
    };
}
// ─── Google OAuth ────────────────────────────────────────────────────────────
export async function googleAuth(idToken) {
    if (!env.GOOGLE_CLIENT_ID) {
        throw new AppError(503, 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID in your environment.', 'OAUTH_UNAVAILABLE');
    }
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    let ticket;
    try {
        ticket = await client.verifyIdToken({
            idToken,
            audience: env.GOOGLE_CLIENT_ID,
        });
    }
    catch (err) {
        throw new UnauthorizedError('Invalid Google ID token: ' + (err.message || 'verification failed'));
    }
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        throw new UnauthorizedError('Google token missing email claim');
    }
    if (!payload.email_verified) {
        throw new UnauthorizedError('Google email is not verified');
    }
    return findOrCreateSocialUser({
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        provider: 'google',
        providerId: payload.sub,
    });
}
// ─── Apple OAuth ─────────────────────────────────────────────────────────────
export async function appleAuth(identityToken, fullName) {
    if (!env.APPLE_CLIENT_ID) {
        throw new AppError(503, 'Apple OAuth is not configured. Set APPLE_CLIENT_ID in your environment.', 'OAUTH_UNAVAILABLE');
    }
    let applePayload;
    try {
        applePayload = await appleSignin.verifyIdToken(identityToken, {
            audience: env.APPLE_CLIENT_ID,
            ignoreExpiration: false,
        });
    }
    catch (err) {
        throw new UnauthorizedError('Invalid Apple identity token: ' + (err.message || 'verification failed'));
    }
    if (!applePayload.email) {
        throw new UnauthorizedError('Apple token missing email claim');
    }
    // Apple only sends the name on the FIRST sign-in. After that it's undefined.
    const name = fullName
        ? [fullName.firstName, fullName.lastName].filter(Boolean).join(' ')
        : '';
    return findOrCreateSocialUser({
        email: applePayload.email,
        name: name || applePayload.email.split('@')[0],
        provider: 'apple',
        providerId: applePayload.sub,
    });
}
// ─── Token Management ────────────────────────────────────────────────────────
export async function refreshToken(token) {
    let payload;
    try {
        payload = verifyRefreshToken(token);
    }
    catch {
        throw new UnauthorizedError('Invalid or expired refresh token');
    }
    const storedTokens = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, payload.userId), eq(refreshTokens.revoked, false)));
    let matchedToken = null;
    for (const stored of storedTokens) {
        const matches = await bcrypt.compare(token, stored.tokenHash);
        if (matches) {
            matchedToken = stored;
            break;
        }
    }
    if (!matchedToken) {
        throw new UnauthorizedError('Refresh token not found or already revoked');
    }
    if (new Date(matchedToken.expiresAt) < new Date()) {
        throw new UnauthorizedError('Refresh token has expired');
    }
    await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, matchedToken.id));
    const tokens = await createTokenPair(payload.userId, payload.role);
    return tokens;
}
export async function changePassword(userId, currentPassword, newPassword) {
    const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user) {
        throw new UnauthorizedError('User not found');
    }
    if (!user.passwordHash) {
        throw new AppError(400, 'Password change is not available for social login accounts. You signed in with Google or Apple.', 'SOCIAL_AUTH_NO_PASSWORD');
    }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
        throw new UnauthorizedError('Current password is incorrect');
    }
    const newHash = await hashPassword(newPassword);
    await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
    // Revoke all existing refresh tokens for this user
    await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, userId));
    return { success: true };
}
export async function logout(userId, token) {
    const storedTokens = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)));
    for (const stored of storedTokens) {
        const matches = await bcrypt.compare(token, stored.tokenHash);
        if (matches) {
            await db
                .update(refreshTokens)
                .set({ revoked: true })
                .where(eq(refreshTokens.id, stored.id));
            break;
        }
    }
}
