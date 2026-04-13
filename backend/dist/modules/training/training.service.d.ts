export declare function uploadFile(userId: string, botId: string, type: 'image' | 'video' | 'document', name: string, fileUrl: string, fileSize?: number): Promise<{
    type: "image" | "video" | "document" | null;
    status: "error" | "pending" | "processing" | "complete" | null;
    id: string;
    name: string;
    createdAt: Date | null;
    userId: string;
    errorMessage: string | null;
    botId: string | null;
    fileUrl: string;
    fileSize: number | null;
    analysisResult: unknown;
}>;
export declare function getUploads(userId: string, botId: string): Promise<{
    id: string;
    userId: string;
    botId: string | null;
    type: "image" | "video" | "document" | null;
    name: string;
    fileUrl: string;
    fileSize: number | null;
    status: "error" | "pending" | "processing" | "complete" | null;
    analysisResult: unknown;
    errorMessage: string | null;
    createdAt: Date | null;
}[]>;
export declare function getUploadById(userId: string, uploadId: string): Promise<{
    id: string;
    userId: string;
    botId: string | null;
    type: "image" | "video" | "document" | null;
    name: string;
    fileUrl: string;
    fileSize: number | null;
    status: "error" | "pending" | "processing" | "complete" | null;
    analysisResult: unknown;
    errorMessage: string | null;
    createdAt: Date | null;
}>;
export declare function getTrainingSummary(userId: string, botId: string): Promise<{
    total: number;
    complete: number;
    processing: number;
    pending: number;
    errors: number;
    trained: boolean;
    insights: {
        patterns: string[];
        indicators: string[];
        entryRules: string[];
        exitRules: string[];
        summaries: string[];
    };
    uploads: {
        id: string;
        name: string;
        type: "image" | "video" | "document" | null;
        status: "error" | "pending" | "processing" | "complete" | null;
        analysisResult: unknown;
        errorMessage: string | null;
        fileSize: number | null;
        createdAt: Date | null;
    }[];
}>;
export declare function startTraining(userId: string, botId: string): Promise<{
    message: string;
    filesProcessed: number;
    results: never[];
    successCount?: undefined;
    errorCount?: undefined;
} | {
    message: string;
    filesProcessed: number;
    successCount: number;
    errorCount: number;
    results: {
        id: string | null;
        name: string;
        type: string | null;
        status: string;
        analysis: Record<string, unknown> | null;
    }[];
}>;
