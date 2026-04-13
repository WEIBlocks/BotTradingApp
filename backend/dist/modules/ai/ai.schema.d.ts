import { z } from 'zod';
export declare const chatMessageSchema: z.ZodObject<{
    message: z.ZodString;
    conversationId: z.ZodOptional<z.ZodString>;
    attachmentUrl: z.ZodOptional<z.ZodString>;
    botId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    botId?: string | undefined;
    conversationId?: string | undefined;
    attachmentUrl?: string | undefined;
}, {
    message: string;
    botId?: string | undefined;
    conversationId?: string | undefined;
    attachmentUrl?: string | undefined;
}>;
export declare const voiceCommandSchema: z.ZodObject<{
    transcript: z.ZodString;
}, "strip", z.ZodTypeAny, {
    transcript: string;
}, {
    transcript: string;
}>;
export declare const strategyGenerateSchema: z.ZodObject<{
    description: z.ZodString;
    pairs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    riskLevel: z.ZodOptional<z.ZodEnum<["Very Low", "Low", "Med", "High", "Very High"]>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    riskLevel?: "Very Low" | "Low" | "Med" | "High" | "Very High" | undefined;
    pairs?: string[] | undefined;
}, {
    description: string;
    riskLevel?: "Very Low" | "Low" | "Med" | "High" | "Very High" | undefined;
    pairs?: string[] | undefined;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type VoiceCommandInput = z.infer<typeof voiceCommandSchema>;
export type StrategyGenerateInput = z.infer<typeof strategyGenerateSchema>;
