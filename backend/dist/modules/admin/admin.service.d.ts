export declare function listUsers(page: number, limit: number, search?: string): Promise<{
    data: {
        id: string;
        name: string;
        email: string;
        role: "user" | "creator" | "admin" | null;
        isActive: boolean | null;
        createdAt: Date | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function getUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    referredBy: string | null;
    role: "user" | "creator" | "admin" | null;
    googleId: string | null;
    appleId: string | null;
    isActive: boolean | null;
    onboardingComplete: boolean | null;
    fcmToken: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function updateUser(userId: string, data: {
    role?: string;
    isActive?: boolean;
    name?: string;
}): Promise<{
    id: string;
    email: string;
    name: string;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    referredBy: string | null;
    role: "user" | "creator" | "admin" | null;
    googleId: string | null;
    appleId: string | null;
    isActive: boolean | null;
    onboardingComplete: boolean | null;
    fcmToken: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function deleteUser(userId: string): Promise<{
    message: string;
}>;
export declare function listBots(page: number, limit: number, status?: string): Promise<{
    data: {
        id: string;
        name: string;
        strategy: string;
        category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
        status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
        isPublished: boolean | null;
        creatorId: string;
        createdAt: Date | null;
        creatorName: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function approveBot(botId: string): Promise<{
    id: string;
    creatorId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    prompt: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    tags: string[] | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function rejectBot(botId: string, reason?: string): Promise<{
    rejectionReason: string | undefined;
    id: string;
    creatorId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    prompt: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    tags: string[] | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function suspendBot(botId: string): Promise<{
    id: string;
    creatorId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    prompt: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    tags: string[] | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function listSubscriptions(page: number, limit: number): Promise<{
    data: {
        id: string;
        userId: string;
        planId: string;
        status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
        currentPeriodStart: Date | null;
        currentPeriodEnd: Date | null;
        createdAt: Date | null;
        userName: string;
        userEmail: string;
        planName: string;
        planPrice: string;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function listExchangeConnections(page: number, limit: number): Promise<{
    data: {
        id: string;
        provider: string;
        method: "oauth" | "api_key" | null;
        status: "error" | "connected" | "disconnected" | "syncing" | null;
        totalBalance: string | null;
        lastSyncAt: Date | null;
        createdAt: Date | null;
        userName: string;
        userEmail: string;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function getRevenueAnalytics(): Promise<{
    totalRevenue: string;
    totalTransactions: number;
    monthly: Record<string, unknown>[];
}>;
export declare function getTradesAnalytics(): Promise<{
    totalTrades: number;
    buyCount: number;
    sellCount: number;
    paperCount: number;
    liveCount: number;
}>;
export declare function getUsersAnalytics(): Promise<{
    newThisMonth: number;
    totalUsers: number;
    activeUsers: number;
    adminCount: number;
    creatorCount: number;
}>;
export declare function getDashboardAnalytics(): Promise<{
    revenue: {
        totalRevenue: string;
        totalTransactions: number;
        monthly: Record<string, unknown>[];
    };
    trades: {
        totalTrades: number;
        buyCount: number;
        sellCount: number;
        paperCount: number;
        liveCount: number;
    };
    users: {
        newThisMonth: number;
        totalUsers: number;
        activeUsers: number;
        adminCount: number;
        creatorCount: number;
    };
    totalBots: number;
    activeSubscriptions: number;
}>;
export declare function grantSubscription(userId: string, planTier: string, durationDays: number): Promise<{
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    id: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    userId: string;
    planId: string;
    platform: "android" | "ios" | "none" | null;
    purchaseToken: string | null;
    orderId: string | null;
    productId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
}>;
export declare function revokeSubscription(userId: string): Promise<{
    id: string;
    userId: string;
    planId: string;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing" | null;
    platform: "android" | "ios" | "none" | null;
    purchaseToken: string | null;
    orderId: string | null;
    productId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelledAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function getSettings(): Promise<{
    maintenanceMode: boolean;
    registrationEnabled: boolean;
    maxBotsPerCreator: number;
    defaultCommissionRate: number;
    minWithdrawalAmount: number;
    supportEmail: string;
}>;
export declare function updateSettings(_data: Record<string, any>): Promise<{
    message: string;
}>;
export declare function getSystemHealth(): Promise<{
    status: string;
    services: {
        database: string;
        redis: string;
    };
    timestamp: string;
}>;
export declare function reactivateBot(botId: string): Promise<{
    id: string;
    creatorId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    prompt: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    tags: string[] | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function getBotDetail(botId: string): Promise<{
    statistics: {
        id: string;
        botId: string;
        return30d: string | null;
        winRate: string | null;
        maxDrawdown: string | null;
        sharpeRatio: string | null;
        activeUsers: number | null;
        reviewCount: number | null;
        avgRating: string | null;
        monthlyReturns: unknown;
        equityData: unknown;
        updatedAt: Date | null;
    };
    training: {
        id: string;
        userId: string;
        botId: string | null;
        type: "image" | "video" | "document" | null;
        name: string;
        fileUrl: string;
        fileSize: number | null;
        status: "error" | "pending" | "processing" | "complete" | null;
        analysisResult: unknown;
        errorMessage: string | null;
        createdAt: Date | null;
    }[];
    reviews: {
        id: string;
        userId: string;
        botId: string;
        rating: number;
        text: string | null;
        createdAt: Date | null;
        userName: string | null;
    }[];
    activeSubscriptions: number;
    id: string;
    creatorId: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    tags: string[] | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    creatorName: string | null;
    creatorEmail: string | null;
}>;
export declare function getUserDetail(userId: string): Promise<{
    activity: {
        id: string;
        userId: string;
        type: "purchase" | "withdrawal" | "profit" | "deposit" | "fee" | null;
        title: string | null;
        subtitle: string | null;
        amount: string | null;
        createdAt: Date | null;
    }[];
    botSubscriptions: {
        id: string;
        botId: string;
        status: "active" | "paused" | "stopped" | "shadow" | "expired" | null;
        mode: "live" | "paper" | null;
        allocatedAmount: string | null;
        startedAt: Date | null;
        expiresAt: Date | null;
        createdAt: Date | null;
        botName: string | null;
    }[];
    exchanges: {
        id: string;
        provider: string;
        method: "oauth" | "api_key" | null;
        status: "error" | "connected" | "disconnected" | "syncing" | null;
        accountLabel: string | null;
        totalBalance: string | null;
        lastSyncAt: Date | null;
        sandbox: boolean | null;
        createdAt: Date | null;
    }[];
    tradeCount: number;
    id: string;
    email: string;
    name: string;
    avatarInitials: string | null;
    avatarColor: string | null;
    riskTolerance: number | null;
    investmentGoal: string | null;
    referralCode: string | null;
    referredBy: string | null;
    role: "user" | "creator" | "admin" | null;
    googleId: string | null;
    appleId: string | null;
    isActive: boolean | null;
    onboardingComplete: boolean | null;
    fcmToken: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
export declare function listTrades(page: number, limit: number, userId?: string, botId?: string): Promise<{
    data: {
        id: string;
        userId: string;
        symbol: string;
        side: "BUY" | "SELL";
        amount: string;
        price: string;
        totalValue: string | null;
        pnl: string | null;
        pnlPercent: string | null;
        isPaper: boolean | null;
        status: "cancelled" | "pending" | "failed" | "filled" | "partially_filled" | null;
        executedAt: Date | null;
        createdAt: Date | null;
        userName: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function listChats(page: number, limit: number, userId?: string): Promise<{
    data: {
        id: string;
        userId: string;
        role: "user" | "assistant";
        content: string;
        conversationId: string;
        createdAt: Date | null;
        userName: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function listShadowSessions(page: number, limit: number): Promise<{
    data: {
        id: string;
        userId: string;
        botId: string | null;
        virtualBalance: string;
        currentBalance: string | null;
        durationDays: number;
        startedAt: Date | null;
        endsAt: Date;
        status: "paused" | "running" | "completed" | "cancelled" | null;
        totalTrades: number | null;
        winCount: number | null;
        createdAt: Date | null;
        userName: string | null;
        botName: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}>;
export declare function deleteReview(reviewId: string): Promise<{
    message: string;
}>;
export declare function sendMassNotification(data: {
    target: 'all' | 'subscribers' | 'creators';
    title: string;
    body: string;
    priority?: 'low' | 'normal' | 'high';
}): Promise<{
    sent: number;
}>;
