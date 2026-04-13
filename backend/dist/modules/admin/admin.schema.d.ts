import { z } from 'zod';
export declare const paginationQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
}, {
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const usersQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
} & {
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    search?: string | undefined;
}, {
    search?: string | undefined;
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const botsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
} & {
    status: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    status?: string | undefined;
}, {
    status?: string | undefined;
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const userIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const botIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const updateUserBodySchema: z.ZodObject<{
    role: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    role?: string | undefined;
    isActive?: boolean | undefined;
}, {
    name?: string | undefined;
    role?: string | undefined;
    isActive?: boolean | undefined;
}>;
export declare const rejectBotBodySchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export declare const updateSettingsBodySchema: z.ZodObject<{}, "passthrough", z.ZodTypeAny, z.objectOutputType<{}, z.ZodTypeAny, "passthrough">, z.objectInputType<{}, z.ZodTypeAny, "passthrough">>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export declare const messageResponseSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare const sendNotificationBodySchema: z.ZodObject<{
    target: z.ZodEnum<["all", "subscribers", "creators"]>;
    title: z.ZodString;
    body: z.ZodString;
    priority: z.ZodDefault<z.ZodOptional<z.ZodEnum<["low", "normal", "high"]>>>;
}, "strip", z.ZodTypeAny, {
    body: string;
    title: string;
    priority: "low" | "normal" | "high";
    target: "all" | "subscribers" | "creators";
}, {
    body: string;
    title: string;
    target: "all" | "subscribers" | "creators";
    priority?: "low" | "normal" | "high" | undefined;
}>;
export declare const tradesQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
} & {
    userId: z.ZodOptional<z.ZodString>;
    botId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    userId?: string | undefined;
    botId?: string | undefined;
}, {
    userId?: string | undefined;
    limit?: number | undefined;
    botId?: string | undefined;
    page?: number | undefined;
}>;
export declare const chatsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
} & {
    userId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    userId?: string | undefined;
}, {
    userId?: string | undefined;
    limit?: number | undefined;
    page?: number | undefined;
}>;
export declare const reviewIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const grantSubscriptionBodySchema: z.ZodObject<{
    tier: z.ZodDefault<z.ZodString>;
    durationDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    durationDays: number;
    tier: string;
}, {
    durationDays?: number | undefined;
    tier?: string | undefined;
}>;
