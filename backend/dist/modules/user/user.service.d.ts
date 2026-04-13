import type { UpdateProfileBody, UpdateSettingsBody } from './user.schema.js';
export declare function saveQuizResults(userId: string, data: {
    riskTolerance: number;
    investmentGoal?: string;
    timeHorizon?: string;
}): Promise<{
    id: string;
    riskTolerance: number;
    riskLevel: "conservative" | "moderate" | "aggressive" | null;
    investmentGoal: string | null;
    timeHorizon: string | null;
    onboardingComplete: boolean;
}>;
export declare function getInvestorProfile(userId: string): Promise<{
    id: string;
    userId: string;
    riskTolerance: number;
    riskLevel: "conservative" | "moderate" | "aggressive" | null;
    investmentGoal: string | null;
    timeHorizon: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function getReferralInfo(userId: string): Promise<{
    referralCode: string | null;
    referralLink: string;
    totalReferred: number;
    totalEarned: number;
    activeReferrals: number;
}>;
export declare function getProfile(userId: string): Promise<{
    authProvider: string;
    id: string;
    name: string;
    email: string;
    role: "user" | "creator" | "admin" | null;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    onboardingComplete: boolean | null;
    isActive: boolean | null;
    createdAt: Date | null;
}>;
export declare function updateProfile(userId: string, data: UpdateProfileBody): Promise<{
    authProvider: string;
    id: string;
    name: string;
    email: string;
    role: "user" | "creator" | "admin" | null;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    onboardingComplete: boolean | null;
    isActive: boolean | null;
    createdAt: Date | null;
} | {
    id: string;
    name: string;
    email: string;
    role: "user" | "creator" | "admin" | null;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    onboardingComplete: boolean | null;
    isActive: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function getWallet(userId: string): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
    };
    totalBalance: string;
    allocatedCapital: string;
    buyingPower: string;
    exchanges: {
        provider: string;
        assetClass: "crypto" | "stocks" | null;
        totalBalance: string;
        allocatedCapital: string;
        buyingPower: string;
        sandbox: boolean;
        status: "error" | "connected" | "disconnected" | "syncing" | null;
    }[];
    recentActivity: {
        id: string;
        userId: string;
        type: "purchase" | "withdrawal" | "profit" | "deposit" | "fee" | null;
        title: string | null;
        subtitle: string | null;
        amount: string | null;
        createdAt: Date | null;
    }[];
}>;
export declare function getActivity(userId: string, page: number, limit: number): Promise<{
    items: {
        id: string;
        userId: string;
        type: "purchase" | "withdrawal" | "profit" | "deposit" | "fee" | null;
        title: string | null;
        subtitle: string | null;
        amount: string | null;
        createdAt: Date | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}>;
export declare function getSettings(userId: string): Promise<{
    id: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    userId: string;
    tradeAlerts: boolean | null;
    systemUpdates: boolean | null;
    priceAlerts: boolean | null;
    pushEnabled: boolean | null;
    emailEnabled: boolean | null;
}>;
export declare function updateSettings(userId: string, data: UpdateSettingsBody): Promise<{
    id: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    userId: string;
    tradeAlerts: boolean | null;
    systemUpdates: boolean | null;
    priceAlerts: boolean | null;
    pushEnabled: boolean | null;
    emailEnabled: boolean | null;
}>;
