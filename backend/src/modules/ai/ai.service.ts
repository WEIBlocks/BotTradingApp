import { eq, desc } from 'drizzle-orm';
import { llmChat, getActiveProvider, getAvailableProviders, type LLMMessage } from '../../config/ai.js';
import { db } from '../../config/database.js';
import { chatMessages } from '../../db/schema/chat.js';
import { bots, botStatistics } from '../../db/schema/bots.js';
import { AppError } from '../../lib/errors.js';

// ─── System Prompts ──────────────────────────────────────────────────────────

const TRADING_ASSISTANT_SYSTEM = `You are TradingBot AI, an expert crypto and financial markets trading assistant built into the BotTradeApp platform.

Your capabilities:
- Analyze trading charts and patterns when images are provided
- Suggest and design automated trading strategies (Momentum, Scalping, Grid, DCA, Mean Reversion, Arbitrage)
- Explain technical indicators in depth: RSI, MACD, Bollinger Bands, EMA/SMA crossovers, Volume Profile, Fibonacci retracements, Ichimoku Cloud, ATR, OBV, Stochastic Oscillator
- Provide market insights, trend analysis, and sentiment interpretation
- Help users understand risk management: position sizing, stop-loss placement, portfolio diversification, Kelly Criterion
- Discuss on-chain metrics, funding rates, open interest, and order flow

Behavioral guidelines:
- Be concise but thorough. Prioritize actionable insights.
- Always caveat that you are not providing financial advice; users should do their own research.
- When a user asks you to create a bot strategy, respond normally with your explanation AND include a JSON block fenced with \`\`\`strategy-json ... \`\`\` containing: { "name": string, "strategy": string, "pairs": string[], "riskLevel": "Very Low"|"Low"|"Med"|"High"|"Very High", "stopLoss": number (percentage), "takeProfit": number (percentage), "backtestEstimate": { "return30d": number, "winRate": number, "maxDrawdown": number } }
- Use clear formatting with bullet points and headers when appropriate.
- If an image is attached, analyze it as a trading chart and identify patterns, support/resistance levels, and potential trade setups.`;

const VOICE_COMMAND_SYSTEM = `You are a voice command parser for the BotTradeApp trading platform. Your job is to interpret spoken commands from traders and convert them into structured actions.

You MUST respond with valid JSON only, no additional text. The JSON schema is:
{
  "action": "pause_bot" | "resume_bot" | "get_portfolio" | "get_profit" | "get_top_bot" | "create_bot" | "set_alert" | "general_query",
  "params": {
    "botId": string | null,
    "botName": string | null,
    "pair": string | null,
    "amount": number | null,
    "query": string | null
  },
  "naturalResponse": string
}

Rules:
- "pause my bot" / "stop the bot" / "halt trading" -> action: "pause_bot"
- "resume" / "start" / "unpause" -> action: "resume_bot"
- "how's my portfolio" / "show balance" / "what's my total" -> action: "get_portfolio"
- "how much profit" / "what are my gains" / "P&L" -> action: "get_profit"
- "best bot" / "top performer" / "which bot is winning" -> action: "get_top_bot"
- "create a bot" / "make a strategy" / "build a bot" -> action: "create_bot"
- "alert me when" / "notify me" / "set price alert" -> action: "set_alert"
- Everything else -> action: "general_query"
- The naturalResponse should be a friendly, conversational confirmation of the action (1-2 sentences).
- If a bot name is mentioned, include it in params.botName.
- If a trading pair is mentioned (BTC/USDT, ETH/BTC, etc.), include it in params.pair.`;

const STRATEGY_GENERATOR_SYSTEM = `You are an expert quantitative trading strategy developer. Given a natural language description, you create complete, well-defined automated trading strategies.

You MUST respond with valid JSON only. The JSON schema is:
{
  "name": string (catchy, memorable name for the strategy),
  "description": string (2-3 sentence summary of how the strategy works),
  "strategy": "Momentum" | "Scalping" | "Grid" | "DCA" | "Mean Reversion" | "Arbitrage" | "Breakout" | "Trend Following",
  "pairs": string[] (e.g., ["BTC/USDT", "ETH/USDT"]),
  "riskLevel": "Very Low" | "Low" | "Med" | "High" | "Very High",
  "stopLoss": number (percentage, e.g., 3.5 means 3.5%),
  "takeProfit": number (percentage),
  "maxPositionSize": number (percentage of portfolio, e.g., 10 means 10%),
  "indicators": string[] (technical indicators used, e.g., ["RSI(14)", "EMA(21)", "MACD(12,26,9)"]),
  "backtestEstimate": {
    "return30d": number (estimated 30-day return percentage, be realistic: -5 to 25),
    "winRate": number (percentage, be realistic: 40-75),
    "maxDrawdown": number (percentage, be realistic based on risk level)
  },
  "entryConditions": string[] (list of conditions that must be met to open a position),
  "exitConditions": string[] (list of conditions that trigger closing a position)
}

Guidelines:
- Generate realistic backtest estimates. Higher risk strategies may have higher returns but also higher drawdown.
- Very Low risk: return30d 1-5%, winRate 55-70%, maxDrawdown 2-5%
- Low risk: return30d 3-10%, winRate 50-65%, maxDrawdown 5-10%
- Med risk: return30d 5-15%, winRate 48-60%, maxDrawdown 10-20%
- High risk: return30d 8-25%, winRate 45-58%, maxDrawdown 15-30%
- Very High risk: return30d 10-35%, winRate 40-55%, maxDrawdown 25-50%
- Choose appropriate indicators for the strategy type.
- If pairs are not specified, suggest appropriate ones based on the strategy.
- If riskLevel is not specified, infer it from the description.`;

const CREATOR_SUGGESTIONS_SYSTEM = `You are a trading bot performance analyst for the BotTradeApp platform. Analyze the creator's bot portfolio and generate specific, actionable improvement suggestions.

You MUST respond with valid JSON only. Return an array of suggestions:
[
  {
    "id": string (unique short id like "sug_1"),
    "title": string (concise, action-oriented title, max 60 chars),
    "description": string (specific, actionable advice in 1-3 sentences),
    "category": "risk_management" | "strategy" | "pricing" | "marketing" | "performance" | "diversification",
    "priority": "high" | "medium" | "low"
  }
]

Rules:
- Generate 3-5 suggestions based on the actual data provided.
- Be specific: reference actual bot names, numbers, and metrics.
- Prioritize suggestions that would have the most impact.
- If a bot has low win rate, suggest strategy adjustments.
- If risk is high but returns are low, flag the poor risk/reward ratio.
- If all bots target the same pairs, suggest diversification.
- If pricing seems off relative to performance, suggest adjustments.
- Always include at least one risk management suggestion.`;

// ─── Service Functions ───────────────────────────────────────────────────────

export async function chat(
  userId: string,
  message: string,
  conversationId?: string,
  attachmentUrl?: string,
) {
  const convId = conversationId ?? crypto.randomUUID();

  // Load prior conversation context (last 20 messages)
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20);

  // Reverse to chronological order
  const priorMessages: LLMMessage[] = history.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Build messages array
  const messages: LLMMessage[] = [
    ...priorMessages,
    { role: 'user', content: message },
  ];

  const response = await llmChat(messages, {
    system: TRADING_ASSISTANT_SYSTEM,
    maxTokens: 2048,
    imageUrl: attachmentUrl,
  });

  const replyText = response.text;

  // Store user message
  await db.insert(chatMessages).values({
    userId,
    role: 'user',
    content: message,
    conversationId: convId,
    metadata: attachmentUrl ? { attachmentUrl } : null,
  });

  // Store assistant reply
  await db.insert(chatMessages).values({
    userId,
    role: 'assistant',
    content: replyText,
    conversationId: convId,
    metadata: {
      provider: response.provider,
      model: response.model,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    },
  });

  // Extract strategy preview if present
  let strategyPreview: Record<string, unknown> | undefined;
  const strategyMatch = replyText.match(
    /```strategy-json\s*([\s\S]*?)```/,
  );
  if (strategyMatch) {
    try {
      strategyPreview = JSON.parse(strategyMatch[1].trim());
    } catch {
      // Ignore parse errors for strategy block
    }
  }

  return {
    reply: replyText,
    conversationId: convId,
    provider: response.provider,
    model: response.model,
    ...(strategyPreview ? { strategyPreview } : {}),
  };
}

export async function voiceCommand(userId: string, transcript: string) {
  const response = await llmChat(
    [{ role: 'user', content: transcript }],
    {
      system: VOICE_COMMAND_SYSTEM,
      maxTokens: 512,
    },
  );

  const rawText = response.text;

  // Parse the JSON response
  let parsed: {
    action: string;
    params: Record<string, unknown>;
    naturalResponse: string;
  };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Try to extract JSON from markdown fence
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1].trim());
      } catch {
        parsed = {
          action: 'general_query',
          params: { query: transcript },
          naturalResponse:
            "I wasn't sure what you meant. Could you try rephrasing that?",
        };
      }
    } else {
      parsed = {
        action: 'general_query',
        params: { query: transcript },
        naturalResponse:
          "I wasn't sure what you meant. Could you try rephrasing that?",
      };
    }
  }

  // Store the voice interaction for analytics
  await db.insert(chatMessages).values({
    userId,
    role: 'user',
    content: transcript,
    metadata: {
      type: 'voice_command',
      parsedAction: parsed.action,
      provider: response.provider,
      model: response.model,
    },
  });

  return { ...parsed, provider: response.provider, model: response.model };
}

export async function generateStrategy(
  userId: string,
  description: string,
  pairs?: string[],
  riskLevel?: string,
) {
  const userPrompt = [
    `Create a trading strategy based on this description: "${description}"`,
    pairs?.length ? `Preferred trading pairs: ${pairs.join(', ')}` : null,
    riskLevel ? `Desired risk level: ${riskLevel}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await llmChat(
    [{ role: 'user', content: userPrompt }],
    {
      system: STRATEGY_GENERATOR_SYSTEM,
      maxTokens: 1500,
    },
  );

  const rawText = response.text;

  let strategy: Record<string, unknown>;
  try {
    strategy = JSON.parse(rawText);
  } catch {
    // Try to extract JSON from response if wrapped in markdown
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        strategy = JSON.parse(jsonMatch[1].trim());
      } catch {
        throw new AppError(
          502,
          'AI returned an invalid strategy format. Please try again.',
          'AI_PARSE_ERROR',
        );
      }
    } else {
      throw new AppError(
        502,
        'AI returned an invalid strategy format. Please try again.',
        'AI_PARSE_ERROR',
      );
    }
  }

  // Store the generation event
  await db.insert(chatMessages).values({
    userId,
    role: 'assistant',
    content: rawText,
    metadata: {
      type: 'strategy_generation',
      description,
      provider: response.provider,
      model: response.model,
    },
  });

  return { ...strategy, provider: response.provider, model: response.model };
}

export async function getCreatorSuggestions(userId: string) {
  // Fetch the creator's bots and their statistics
  const creatorBots = await db
    .select({
      id: bots.id,
      name: bots.name,
      strategy: bots.strategy,
      category: bots.category,
      riskLevel: bots.riskLevel,
      priceMonthly: bots.priceMonthly,
      status: bots.status,
      return30d: botStatistics.return30d,
      winRate: botStatistics.winRate,
      activeUsers: botStatistics.activeUsers,
      avgRating: botStatistics.avgRating,
      reviewCount: botStatistics.reviewCount,
      maxDrawdown: botStatistics.maxDrawdown,
    })
    .from(bots)
    .leftJoin(botStatistics, eq(bots.id, botStatistics.botId))
    .where(eq(bots.creatorId, userId));

  if (creatorBots.length === 0) {
    return [
      {
        id: 'sug_new',
        title: 'Create Your First Bot',
        description:
          'Start by creating a trading bot. Use the AI Strategy Generator to design a strategy based on your trading style.',
        category: 'strategy',
        priority: 'high',
      },
    ];
  }

  const botsData = JSON.stringify(creatorBots, null, 2);

  const response = await llmChat(
    [
      {
        role: 'user',
        content: `Here are my bots and their performance data:\n\n${botsData}\n\nPlease analyze and provide improvement suggestions.`,
      },
    ],
    {
      system: CREATOR_SUGGESTIONS_SYSTEM,
      maxTokens: 1500,
    },
  );

  const rawText = response.text;

  let suggestions: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    priority: string;
  }>;
  try {
    suggestions = JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        suggestions = JSON.parse(jsonMatch[1].trim());
      } catch {
        suggestions = [
          {
            id: 'sug_fallback',
            title: 'Review Bot Performance',
            description:
              "Check your bots' recent performance metrics and consider adjusting parameters for underperforming strategies.",
            category: 'performance',
            priority: 'medium',
          },
        ];
      }
    } else {
      suggestions = [
        {
          id: 'sug_fallback',
          title: 'Review Bot Performance',
          description:
            "Check your bots' recent performance metrics and consider adjusting parameters for underperforming strategies.",
          category: 'performance',
          priority: 'medium',
        },
      ];
    }
  }

  return suggestions;
}

// ─── Provider Status ─────────────────────────────────────────────────────────

export function getProviderStatus() {
  const active = getActiveProvider();
  const available = getAvailableProviders();
  return {
    active,
    available,
    count: available.length,
  };
}
