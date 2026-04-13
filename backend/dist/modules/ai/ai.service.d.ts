declare function validateTrainingImage(imageUrl: string): Promise<{
    valid: boolean;
    type: string;
    reason: string;
}>;
declare function validateTrainingContent(content: string): {
    valid: boolean;
    reason: string;
};
export { validateTrainingImage, validateTrainingContent };
export declare function chat(userId: string, message: string, conversationId?: string, attachmentUrl?: string, botId?: string): Promise<{
    reply: string;
    conversationId: string;
    provider: string;
    model: string;
    error?: undefined;
    errorDetail?: undefined;
} | {
    reply: string;
    conversationId: string;
    provider: string;
    model: string;
    error: string;
    errorDetail: any;
} | {
    strategyPreview?: Record<string, unknown> | undefined;
    reply: string;
    conversationId: string;
    provider: import("../../config/ai.js").LLMProvider;
    model: string;
    cleanPrompt: string;
    error?: undefined;
    errorDetail?: undefined;
}>;
export declare function voiceCommand(userId: string, transcript: string): Promise<{
    transcript: string;
    intent: string;
    action: string;
    reply: string;
} | {
    provider: import("../../config/ai.js").LLMProvider;
    model: string;
    action: string;
    params: Record<string, unknown>;
    naturalResponse: string;
    transcript?: undefined;
    intent?: undefined;
    reply?: undefined;
}>;
export declare function generateStrategy(userId: string, description: string, pairs?: string[], riskLevel?: string): Promise<{
    provider: import("../../config/ai.js").LLMProvider;
    model: string;
}>;
export declare function getCreatorSuggestions(userId: string): Promise<{
    id: string;
    title: string;
    description: string;
    category: string;
    priority: string;
}[]>;
export declare function listConversations(userId: string): Promise<{
    id: string;
    title: string;
    messageCount: number;
    createdAt: string;
    lastMessageAt: string;
}[]>;
export declare function getConversation(userId: string, conversationId: string): Promise<{
    conversationId: string;
    messages: {
        id: string;
        role: "user" | "assistant";
        content: string;
        metadata: unknown;
        createdAt: Date | null;
    }[];
}>;
export declare function deleteConversation(userId: string, conversationId: string): Promise<{
    deleted: boolean;
}>;
export declare function getChatHistory(userId: string): Promise<{
    messages: never[];
    conversationId: null;
} | {
    conversationId: string;
    messages: {
        id: string;
        role: "user" | "assistant";
        content: string;
        metadata: unknown;
        createdAt: Date | null;
    }[];
}>;
export declare function getProviderStatus(): {
    active: {
        provider: import("../../config/ai.js").LLMProvider;
        model: string;
    } | null;
    available: {
        provider: import("../../config/ai.js").LLMProvider;
        model: string;
        isActive: boolean;
    }[];
    count: number;
};
