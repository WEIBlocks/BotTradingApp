export declare function getStats(userId: string): Promise<{
    totalBots: number;
    activeSubscribers: number;
    avgRating: string;
    totalReviews: number;
    totalRevenue: string;
}>;
export declare function getMonthlyRevenue(userId: string, months?: number): Promise<Record<string, unknown>[]>;
export declare function getCreatorBots(userId: string): Promise<{
    totalUsers: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalPnl: number;
    totalDecisions: number;
    totalBuys: number;
    totalSells: number;
    totalHolds: number;
    totalTrades: number;
    totalSubscribers: number;
    totalEarnings: number;
    userBreakdown: {
        userId: any;
        name: any;
        email: any;
        decisions: number;
        buys: number;
        sells: number;
        holds: number;
        trades: number;
        positions: number;
        pnl: number;
        status: any;
        mode: any;
    }[];
    id: string;
    name: string;
    subtitle: string | null;
    strategy: string;
    category: "Crypto" | "Stocks" | "Forex" | "Multi" | null;
    riskLevel: "Very Low" | "Low" | "Med" | "High" | "Very High" | null;
    priceMonthly: string | null;
    creatorFeePercent: string | null;
    platformFeePercent: string | null;
    status: "draft" | "pending_review" | "approved" | "rejected" | "suspended" | null;
    isPublished: boolean | null;
    avatarColor: string | null;
    avatarLetter: string | null;
    config: unknown;
    version: string | null;
    createdAt: Date | null;
    return30d: string | null;
    winRate: string | null;
    maxDrawdown: string | null;
    sharpeRatio: string | null;
    activeUsers: number | null;
    avgRating: string | null;
    reviewCount: number | null;
}[]>;
export declare function publishBot(userId: string, botId: string): Promise<{
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
export declare function getEarningsSummary(userId: string): Promise<{
    totalEarnings: number;
    totalPlatformFees: number;
    totalSubscriberProfits: number;
    pendingPayout: number;
    activeSubscribers: number;
    transactionCount: number;
    botEarnings: {
        botId: string;
        botName: string;
        totalEarning: number;
        totalSubscriberProfit: number;
        transactions: number;
    }[];
    recentEarnings: {
        id: string;
        botName: string;
        subscriberProfit: string;
        creatorFeePercent: string;
        creatorEarning: string;
        platformFee: string;
        status: "pending" | "paid" | "failed" | null;
        periodStart: Date;
        periodEnd: Date;
        createdAt: Date | null;
    }[];
}>;
export declare function getEarningsProjection(userId: string): Promise<{
    botId: string;
    botName: string;
    creatorFeePercent: number;
    platformFeePercent: number;
    activeUsers: number;
}[]>;
export declare function getAISuggestions(userId: string): Promise<{
    id: string;
    title: string;
    description: string;
    category: string;
    priority: string;
}[]>;
export declare function getEngagementMetrics(creatorId: string, days?: number): Promise<{
    summary: {
        totalViews: number;
        totalPurchases: number;
        conversionRate: number;
        subscriberGrowth: number;
        churnRate: number;
        avgRevenuePerUser: number;
    };
    daily: {
        date: Date;
        subscribers: number | null;
        newSubscribers: number | null;
        churned: number | null;
        revenue: number | null;
        views: number | null;
        purchases: number | null;
    }[];
}>;
export declare function getUserProfitability(creatorId: string): Promise<{
    topEarners: {
        userId: string;
        userName: string;
        botId: string;
        totalProfit: number | null;
        totalTrades: number | null;
        winRate: number | null;
        subscriptionDays: number | null;
        isActive: boolean | null;
    }[];
    distribution: {
        profitable: number;
        breakeven: number;
        losing: number;
    };
    avgLTV: number;
    totalUsers: number;
}>;
export declare function createExperiment(creatorId: string, data: {
    botId: string;
    name: string;
    description?: string;
    variantAConfig?: Record<string, unknown>;
    variantBConfig?: Record<string, unknown>;
}): Promise<{
    status: string;
    id: string;
    name: string;
    createdAt: Date;
    description: string | null;
    creatorId: string;
    botId: string;
    confidence: number | null;
    startDate: Date | null;
    endDate: Date | null;
    variantAVersionId: string | null;
    variantBVersionId: string | null;
    variantAConfig: unknown;
    variantBConfig: unknown;
    variantASubscribers: number | null;
    variantBSubscribers: number | null;
    variantARevenue: number | null;
    variantBRevenue: number | null;
    variantAReturn: number | null;
    variantBReturn: number | null;
    variantAChurn: number | null;
    variantBChurn: number | null;
    winnerVariant: string | null;
}>;
export declare function getExperiments(creatorId: string): Promise<{
    id: string;
    botId: string;
    botName: string;
    name: string;
    description: string | null;
    status: string;
    variantASubscribers: number | null;
    variantBSubscribers: number | null;
    variantARevenue: number | null;
    variantBRevenue: number | null;
    variantAReturn: number | null;
    variantBReturn: number | null;
    variantAChurn: number | null;
    variantBChurn: number | null;
    winnerVariant: string | null;
    confidence: number | null;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: Date;
}[]>;
export declare function getExperimentResults(experimentId: string, creatorId: string): Promise<{
    experiment: {
        id: string;
        creatorId: string;
        botId: string;
        name: string;
        description: string | null;
        status: string;
        variantAVersionId: string | null;
        variantBVersionId: string | null;
        variantAConfig: unknown;
        variantBConfig: unknown;
        variantASubscribers: number | null;
        variantBSubscribers: number | null;
        variantARevenue: number | null;
        variantBRevenue: number | null;
        variantAReturn: number | null;
        variantBReturn: number | null;
        variantAChurn: number | null;
        variantBChurn: number | null;
        winnerVariant: string | null;
        confidence: number | null;
        startDate: Date | null;
        endDate: Date | null;
        createdAt: Date;
    };
    analysis: {
        avgRevenuePerUserA: number;
        avgRevenuePerUserB: number;
        returnA: number;
        returnB: number;
        churnA: number;
        churnB: number;
        zScore: number;
        confidence: number;
        winner: string | null;
        recommendation: string;
    };
}>;
export declare function stopExperiment(experimentId: string, creatorId: string): Promise<{
    id: string;
    creatorId: string;
    botId: string;
    name: string;
    description: string | null;
    status: string;
    variantAVersionId: string | null;
    variantBVersionId: string | null;
    variantAConfig: unknown;
    variantBConfig: unknown;
    variantASubscribers: number | null;
    variantBSubscribers: number | null;
    variantARevenue: number | null;
    variantBRevenue: number | null;
    variantAReturn: number | null;
    variantBReturn: number | null;
    variantAChurn: number | null;
    variantBChurn: number | null;
    winnerVariant: string | null;
    confidence: number | null;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: Date;
}>;
export declare function getBotPatternAnalysis(botId: string, creatorId: string): Promise<{
    id: string;
    botId: string;
    maxDrawdown: number | null;
    sharpeRatio: number | null;
    analysisDate: Date;
    detectedPatterns: unknown;
    marketCorrelation: unknown;
    bestConditions: string | null;
    worstConditions: string | null;
    riskScore: number | null;
    consistencyScore: number | null;
    suggestedImprovements: unknown;
} | {
    botId: string;
    analysisDate: Date;
    detectedPatterns: {
        pattern: string;
        confidence: number;
        description: string;
    }[];
    marketCorrelation: {
        btc: number;
        eth: number;
        overall_market: number;
    };
    bestConditions: string;
    worstConditions: string;
    riskScore: number;
    consistencyScore: number;
    sharpeRatio: number;
    maxDrawdown: number;
    suggestedImprovements: {
        title: string;
        description: string;
        impact: string;
    }[];
}>;
export declare function getChurnAnalysis(creatorId: string): Promise<{
    overallChurnRate: number;
    monthlyChurn: never[];
    botChurn: never[];
    atRiskUsers: number;
    retentionCurve: never[];
    activeUsers?: undefined;
    totalUsers?: undefined;
    churnedUsers?: undefined;
} | {
    overallChurnRate: number;
    activeUsers: number;
    totalUsers: number;
    churnedUsers: number;
    monthlyChurn: Record<string, unknown>[];
    botChurn: {
        botId: string;
        botName: string;
        activeUsers: number;
        churnedUsers: number;
        churnRate: number;
    }[];
    atRiskUsers: number;
    retentionCurve?: undefined;
}>;
export declare function getEnhancedRevenueProjection(creatorId: string): Promise<{
    currentMetrics: {
        activeSubscribers: number;
        monthlyChurnRate: number;
        totalRevenue: number;
    };
    projections: {
        threeMonth: {
            optimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            realistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            pessimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
        };
        sixMonth: {
            optimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            realistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            pessimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
        };
        twelveMonth: {
            optimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            realistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
            pessimistic: {
                totalRevenue: number;
                finalSubscribers: number;
                monthly: {
                    month: number;
                    revenue: number;
                    subscribers: number;
                }[];
            };
        };
    };
}>;
export declare function getMarketingMetrics(creatorId: string): Promise<{
    funnel: {
        published: number;
        purchased: number;
        active: number;
        retained: number;
        totalPurchases?: undefined;
        activeUsers?: undefined;
        reviewers?: undefined;
    };
    conversionRates: {
        purchaseRate?: undefined;
        retentionRate?: undefined;
        reviewRate?: undefined;
    };
    botPerformance: never[];
} | {
    funnel: {
        published: number;
        totalPurchases: number;
        activeUsers: number;
        reviewers: number;
        purchased?: undefined;
        active?: undefined;
        retained?: undefined;
    };
    conversionRates: {
        purchaseRate: number;
        retentionRate: number;
        reviewRate: number;
    };
    botPerformance: {
        botId: string;
        botName: string;
        isPublished: boolean | null;
        totalPurchases: number;
        activeUsers: number;
        revenue: number;
        retentionRate: number;
    }[];
}>;
export declare function getBotSubscriberDetails(botId: string, creatorId: string): Promise<{
    botName: string;
    totalSubscribers: number;
    activeSubscribers: number;
    subscribers: {
        positions: number;
        closedPositions: number;
        wins: number;
        winRate: number;
        totalPnl: number;
        avgReturn: number;
        creatorEarning: number;
        subId: string;
        userId: string;
        userName: string | null;
        userEmail: string | null;
        mode: "live" | "paper" | null;
        status: "active" | "paused" | "stopped" | "shadow" | "expired" | null;
        allocatedAmount: string | null;
        startedAt: Date | null;
    }[];
}>;
export declare function getBotTradeSummary(botId: string, creatorId: string): Promise<{
    botName: string;
    strategy: string;
    decisions: {
        total: number;
        buys: number;
        sells: number;
        holds: number;
        aiCalls: number;
        totalTokensCost: number;
        uniqueUsers: number;
    };
    positions: {
        total: number;
        open: number;
        closed: number;
        wins: number;
        losses: number;
        winRate: number;
        totalPnl: number;
        avgPnlPercent: number;
        bestTrade: number;
        worstTrade: number;
    };
    recentTrades: {
        id: string;
        symbol: string;
        side: "BUY" | "SELL";
        amount: number;
        price: number;
        pnl: number | null;
        isPaper: boolean | null;
        executedAt: Date | null;
        userName: string | null;
    }[];
}>;
