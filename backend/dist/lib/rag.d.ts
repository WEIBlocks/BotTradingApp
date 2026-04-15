export declare function storeKnowledge(opts: {
    userId: string;
    botId?: string;
    sourceType: string;
    sourceId?: string;
    content: string;
    summary?: string;
    metadata?: Record<string, unknown>;
}): Promise<{
    id: string;
    createdAt: Date;
    userId: string;
    content: string;
    summary: string | null;
    botId: string | null;
    sourceType: string;
    sourceId: string | null;
    embedding: unknown;
    embeddingModel: string | null;
    metadata: unknown;
}>;
export declare function retrieveKnowledge(opts: {
    userId: string;
    botId?: string;
    query: string;
    topK?: number;
}): Promise<Array<{
    content: string;
    summary: string | null;
    sourceType: string;
    score: number;
}>>;
export declare function storeTrainingChunks(opts: {
    userId: string;
    botId?: string;
    sourceType: string;
    sourceId: string;
    text: string;
    metadata?: Record<string, unknown>;
}): Promise<number>;
