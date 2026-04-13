import { z } from 'zod';
export declare const postMessageSchema: {
    body: z.ZodObject<{
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
    }, {
        content: string;
    }>;
};
export declare const getMessagesSchema: {
    querystring: z.ZodObject<{
        limit: z.ZodDefault<z.ZodNumber>;
        before: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        limit: number;
        before?: string | undefined;
    }, {
        limit?: number | undefined;
        before?: string | undefined;
    }>;
};
export declare const deleteMessageSchema: {
    params: z.ZodObject<{
        id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
    }, {
        id: string;
    }>;
};
