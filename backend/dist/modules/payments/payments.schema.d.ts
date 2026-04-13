import { z } from 'zod';
export declare const addPaymentMethodBodySchema: z.ZodObject<{
    type: z.ZodEnum<["card", "crypto"]>;
    label: z.ZodOptional<z.ZodString>;
    last4: z.ZodOptional<z.ZodString>;
    network: z.ZodOptional<z.ZodString>;
    cryptoAddress: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "crypto" | "card";
    network?: string | undefined;
    label?: string | undefined;
    last4?: string | undefined;
    cryptoAddress?: string | undefined;
}, {
    type: "crypto" | "card";
    network?: string | undefined;
    label?: string | undefined;
    last4?: string | undefined;
    cryptoAddress?: string | undefined;
}>;
export declare const paymentMethodIdParamsSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
export declare const checkoutConfirmBodySchema: z.ZodObject<{
    type: z.ZodEnum<["bot_purchase", "subscription", "deposit", "withdrawal"]>;
    itemId: z.ZodOptional<z.ZodString>;
    amount: z.ZodString;
    paymentMethodId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "withdrawal" | "deposit" | "subscription" | "bot_purchase";
    amount: string;
    itemId?: string | undefined;
    paymentMethodId?: string | undefined;
}, {
    type: "withdrawal" | "deposit" | "subscription" | "bot_purchase";
    amount: string;
    itemId?: string | undefined;
    paymentMethodId?: string | undefined;
}>;
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
