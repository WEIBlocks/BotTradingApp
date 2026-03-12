import { z } from 'zod';

export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(4000),
  conversationId: z.string().uuid().optional(),
  attachmentUrl: z.string().url().optional(),
});

export const voiceCommandSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required').max(2000),
});

export const strategyGenerateSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  pairs: z.array(z.string()).optional(),
  riskLevel: z.enum(['Very Low', 'Low', 'Med', 'High', 'Very High']).optional(),
});

export const dataResponseSchema = z.object({
  data: z.any(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type VoiceCommandInput = z.infer<typeof voiceCommandSchema>;
export type StrategyGenerateInput = z.infer<typeof strategyGenerateSchema>;
