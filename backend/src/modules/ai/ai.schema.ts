import { z } from 'zod';

export const chatMessageSchema = z.object({
  // Raised from 4000 → 8000 to allow long bot-creation prompts
  message: z.string().min(1, 'Message is required').max(8000, 'Message is too long (max 8000 characters). Please shorten your prompt.'),
  conversationId: z.string().uuid().optional(),
  attachmentUrl: z.string().optional(),
  botId: z.string().uuid().optional(),
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
