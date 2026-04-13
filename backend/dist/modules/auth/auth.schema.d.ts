import { z } from 'zod';
export declare const registerSchema: {
    body: z.ZodObject<{
        name: z.ZodString;
        email: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        email: string;
        password: string;
    }, {
        name: string;
        email: string;
        password: string;
    }>;
};
export declare const loginSchema: {
    body: z.ZodObject<{
        email: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        password: string;
    }, {
        email: string;
        password: string;
    }>;
};
export declare const refreshTokenSchema: {
    body: z.ZodObject<{
        refreshToken: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        refreshToken: string;
    }, {
        refreshToken: string;
    }>;
};
export declare const oauthSchema: {
    body: z.ZodObject<{
        idToken: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        idToken: string;
    }, {
        idToken: string;
    }>;
};
export declare const logoutSchema: {
    body: z.ZodObject<{
        refreshToken: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        refreshToken?: string | undefined;
    }, {
        refreshToken?: string | undefined;
    }>;
};
export declare const appleAuthSchema: {
    body: z.ZodObject<{
        identityToken: z.ZodString;
        fullName: z.ZodOptional<z.ZodObject<{
            firstName: z.ZodOptional<z.ZodString>;
            lastName: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            firstName?: string | undefined;
            lastName?: string | undefined;
        }, {
            firstName?: string | undefined;
            lastName?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        identityToken: string;
        fullName?: {
            firstName?: string | undefined;
            lastName?: string | undefined;
        } | undefined;
    }, {
        identityToken: string;
        fullName?: {
            firstName?: string | undefined;
            lastName?: string | undefined;
        } | undefined;
    }>;
};
export declare const refreshTokenResponseSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
    accessToken: string;
}, {
    refreshToken: string;
    accessToken: string;
}>;
export declare const messageResponseSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
export declare const authResponseSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        email: z.ZodString;
        role: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        email: string;
        role: string;
    }, {
        id: string;
        name: string;
        email: string;
        role: string;
    }>;
    isNewUser: z.ZodOptional<z.ZodBoolean>;
    onboardingComplete: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
    };
    refreshToken: string;
    accessToken: string;
    onboardingComplete?: boolean | undefined;
    isNewUser?: boolean | undefined;
}, {
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
    };
    refreshToken: string;
    accessToken: string;
    onboardingComplete?: boolean | undefined;
    isNewUser?: boolean | undefined;
}>;
export declare const changePasswordSchema: {
    body: z.ZodObject<{
        currentPassword: z.ZodString;
        newPassword: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        currentPassword: string;
        newPassword: string;
    }, {
        currentPassword: string;
        newPassword: string;
    }>;
};
export type RegisterBody = z.infer<typeof registerSchema.body>;
export type LoginBody = z.infer<typeof loginSchema.body>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema.body>;
export type OAuthBody = z.infer<typeof oauthSchema.body>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
