import { z } from 'zod';
export declare const uploadFileBodySchema: z.ZodObject<{
    botId: z.ZodString;
    type: z.ZodEnum<["image", "video", "document"]>;
    name: z.ZodString;
    fileUrl: z.ZodString;
    fileSize: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "image" | "video" | "document";
    name: string;
    botId: string;
    fileUrl: string;
    fileSize?: number | undefined;
}, {
    type: "image" | "video" | "document";
    name: string;
    botId: string;
    fileUrl: string;
    fileSize?: number | undefined;
}>;
export declare const uploadsParamsSchema: z.ZodObject<{
    botId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    botId: string;
}, {
    botId: string;
}>;
export declare const startTrainingBodySchema: z.ZodObject<{
    botId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    botId: string;
}, {
    botId: string;
}>;
export declare const dataResponseSchema: z.ZodObject<{
    data: z.ZodAny;
}, "strip", z.ZodTypeAny, {
    data?: any;
}, {
    data?: any;
}>;
