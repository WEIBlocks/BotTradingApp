export declare function createTicket(userId: string, data: {
    type: string;
    title: string;
    description: string;
    category?: string;
}): Promise<{
    type: "support" | "bug_report" | "feature_request";
    status: "open" | "closed" | "in_progress" | "resolved";
    id: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    description: string;
    title: string;
    category: string | null;
    priority: "low" | "normal" | "high" | "critical";
}>;
export declare function getUserTickets(userId: string, page?: number, limit?: number): Promise<{
    data: {
        id: string;
        userId: string;
        type: "support" | "bug_report" | "feature_request";
        title: string;
        description: string;
        status: "open" | "closed" | "in_progress" | "resolved";
        priority: "low" | "normal" | "high" | "critical";
        category: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
    };
}>;
export declare function getTicketMessages(ticketId: string, requestUserId: string, role?: string): Promise<{
    ticket: {
        id: string;
        userId: string;
        type: "support" | "bug_report" | "feature_request";
        title: string;
        description: string;
        status: "open" | "closed" | "in_progress" | "resolved";
        priority: "low" | "normal" | "high" | "critical";
        category: string | null;
        createdAt: Date;
        updatedAt: Date;
    };
    messages: {
        id: string;
        ticketId: string;
        userId: string;
        content: string;
        isAdmin: boolean;
        createdAt: Date;
        userName: string | null;
        avatarInitials: string | null;
        avatarColor: string | null;
    }[];
}>;
export declare function replyToTicket(ticketId: string, userId: string, content: string, isAdmin: boolean): Promise<{
    id: string;
    createdAt: Date;
    userId: string;
    content: string;
    ticketId: string;
    isAdmin: boolean;
}>;
export declare function listAllTickets(page?: number, limit?: number, status?: string, type?: string, search?: string): Promise<{
    data: {
        id: string;
        userId: string;
        type: "support" | "bug_report" | "feature_request";
        title: string;
        description: string;
        status: "open" | "closed" | "in_progress" | "resolved";
        priority: "low" | "normal" | "high" | "critical";
        category: string | null;
        createdAt: Date;
        updatedAt: Date;
        userName: string | null;
        userEmail: string | null;
    }[];
    pagination: {
        page: number;
        limit: number;
        total: number;
    };
}>;
export declare function updateTicket(ticketId: string, data: {
    status?: string;
    priority?: string;
}): Promise<{
    id: string;
    userId: string;
    type: "support" | "bug_report" | "feature_request";
    title: string;
    description: string;
    status: "open" | "closed" | "in_progress" | "resolved";
    priority: "low" | "normal" | "high" | "critical";
    category: string | null;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function sendDirectNotification(userId: string, title: string, body: string): Promise<{
    type: "trade" | "system" | "alert" | null;
    id: string;
    createdAt: Date | null;
    userId: string;
    body: string | null;
    title: string;
    priority: "low" | "normal" | "high" | null;
    read: boolean | null;
    tradeId: string | null;
    chartData: unknown;
}>;
