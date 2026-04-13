export declare function getMessages(limit: number, beforeId?: string): Promise<{
    data: {
        id: string;
        content: string;
        isSystemMessage: boolean | null;
        createdAt: Date | null;
        userId: string;
        userName: string;
        avatarInitials: string | null;
        avatarColor: string | null;
    }[];
}>;
export declare function postMessage(userId: string, content: string): Promise<{
    data: {
        userName: string;
        avatarInitials: string | null;
        avatarColor: string | null;
        id: string;
        createdAt: Date | null;
        userId: string;
        content: string;
        isSystemMessage: boolean | null;
    };
}>;
export declare function deleteMessage(userId: string, messageId: string, role?: string): Promise<{
    data: {
        deleted: boolean;
    };
}>;
export declare function getOnlineCount(): Promise<{
    data: {
        online: number;
        totalMembers: number;
    };
}>;
export declare function getMembers(): Promise<{
    data: {
        isOnline: boolean;
        id: string;
        name: string;
        avatarInitials: string | null;
        avatarColor: string | null;
        role: "user" | "creator" | "admin" | null;
    }[];
}>;
