export declare function getUserPaymentMethods(userId: string): Promise<{
    id: string;
    userId: string;
    type: string | null;
    label: string | null;
    isDefault: boolean | null;
    createdAt: Date | null;
}[]>;
export declare function addPaymentMethod(userId: string, data: {
    type: 'card' | 'crypto';
    label?: string;
    last4?: string;
    network?: string;
    cryptoAddress?: string;
}): Promise<{
    type: string | null;
    id: string;
    createdAt: Date | null;
    userId: string;
    label: string | null;
    isDefault: boolean | null;
}>;
export declare function deletePaymentMethod(userId: string, methodId: string): Promise<{
    type: string | null;
    id: string;
    createdAt: Date | null;
    userId: string;
    label: string | null;
    isDefault: boolean | null;
}>;
export declare function confirmCheckout(userId: string, data: {
    type: 'bot_purchase' | 'subscription' | 'deposit' | 'withdrawal';
    itemId?: string;
    amount: string;
    paymentMethodId?: string;
}): Promise<{
    type: "withdrawal" | "deposit" | "subscription" | "subscription_renewal" | null;
    status: "pending" | "failed" | "succeeded" | "refunded" | null;
    id: string;
    createdAt: Date | null;
    userId: string;
    amount: string;
    metadata: unknown;
    currency: string | null;
    iapToken: string | null;
}>;
