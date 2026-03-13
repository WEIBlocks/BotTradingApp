import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
};

export const refreshTokenSchema = {
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
};

export const oauthSchema = {
  body: z.object({
    idToken: z.string().min(1, 'ID token is required'),
  }),
};

export const logoutSchema = {
  body: z.object({
    refreshToken: z.string().optional(),
  }),
};

export const appleAuthSchema = {
  body: z.object({
    identityToken: z.string().min(1, 'Identity token is required'),
    fullName: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }).optional(),
  }),
};

export const refreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const messageResponseSchema = z.object({
  message: z.string(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
  }),
  isNewUser: z.boolean().optional(),
  onboardingComplete: z.boolean().optional(),
});

export type RegisterBody = z.infer<typeof registerSchema.body>;
export type LoginBody = z.infer<typeof loginSchema.body>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema.body>;
export type OAuthBody = z.infer<typeof oauthSchema.body>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
