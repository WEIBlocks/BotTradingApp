export declare function getNotifications(userId: string, page: number, limit: number): Promise<{
    data: {
        id: string;
        userId: string;
        type: "trade" | "system" | "alert" | null;
        title: string;
        body: string | null;
        priority: "low" | "normal" | "high" | null;
        read: boolean | null;
        tradeId: string | null;
        chartData: unknown;
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
export declare function markAsRead(userId: string, notificationId: string): Promise<{
    id: string;
    userId: string;
    type: "trade" | "system" | "alert" | null;
    title: string;
    body: string | null;
    priority: "low" | "normal" | "high" | null;
    read: boolean | null;
    tradeId: string | null;
    chartData: unknown;
    createdAt: Date | null;
}>;
export declare function markAllAsRead(userId: string): Promise<{
    success: boolean;
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
export declare function updateSettings(userId: string, data: {
    tradeAlerts?: boolean;
    systemUpdates?: boolean;
    priceAlerts?: boolean;
    pushEnabled?: boolean;
    emailEnabled?: boolean;
}): Promise<{
    id: string;
    userId: string;
    tradeAlerts: boolean | null;
    systemUpdates: boolean | null;
    priceAlerts: boolean | null;
    pushEnabled: boolean | null;
    emailEnabled: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}>;
