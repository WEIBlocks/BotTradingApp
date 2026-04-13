export declare function sendNotification(userId: string, data: {
    type: 'trade' | 'system' | 'alert';
    title: string;
    body: string;
    priority?: 'low' | 'normal' | 'high';
}): Promise<{
    type: "trade" | "system" | "alert" | null;
    id: string;
    createdAt: Date | null;
    userId: string;
    body: string | null;
    title: string;
    priority: "low" | "normal" | "high" | null;
    read: boolean | null;
    tradeId: string | null;
    chartData: unknown;
}>;
