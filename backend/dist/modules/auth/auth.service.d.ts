export declare function register(name: string, email: string, password: string): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: "user" | "creator" | "admin";
    };
    isNewUser: boolean;
    onboardingComplete: boolean;
    accessToken: string;
    refreshToken: string;
}>;
export declare function login(email: string, password: string): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: "user" | "creator" | "admin";
    };
    isNewUser: boolean;
    onboardingComplete: boolean;
    accessToken: string;
    refreshToken: string;
}>;
export declare function googleAuth(idToken: string): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: "user" | "creator" | "admin";
    };
    isNewUser: boolean;
    onboardingComplete: boolean;
    accessToken: string;
    refreshToken: string;
}>;
export declare function appleAuth(identityToken: string, fullName?: {
    firstName?: string;
    lastName?: string;
}): Promise<{
    user: {
        id: string;
        name: string;
        email: string;
        role: "user" | "creator" | "admin";
    };
    isNewUser: boolean;
    onboardingComplete: boolean;
    accessToken: string;
    refreshToken: string;
}>;
export declare function refreshToken(token: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
    success: boolean;
}>;
export declare function logout(userId: string, token: string): Promise<void>;
