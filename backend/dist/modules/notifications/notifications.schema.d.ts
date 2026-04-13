import { z } from 'zod';
export declare const notificationsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
}, {
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const notificationIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const updateNotificationSettingsBodySchema: z.ZodObject<{
    tradeAlerts: z.ZodOptional<z.ZodBoolean>;
    systemUpdates: z.ZodOptional<z.ZodBoolean>;
    priceAlerts: z.ZodOptional<z.ZodBoolean>;
    pushEnabled: z.ZodOptional<z.ZodBoolean>;
    emailEnabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    tradeAlerts?: boolean | undefined;
    systemUpdates?: boolean | undefined;
    priceAlerts?: boolean | undefined;
    pushEnabled?: boolean | undefined;
    emailEnabled?: boolean | undefined;
}, {
    tradeAlerts?: boolean | undefined;
    systemUpdates?: boolean | undefined;
    priceAlerts?: boolean | undefined;
    pushEnabled?: boolean | undefined;
    emailEnabled?: boolean | undefined;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
