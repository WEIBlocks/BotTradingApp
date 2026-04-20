import { eq, desc, and, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { llmChat, getActiveProvider, getAvailableProviders } from '../../config/ai.js';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { chatMessages, conversations } from '../../db/schema/chat.js';
import { bots, botStatistics } from '../../db/schema/bots.js';
import { AppError } from '../../lib/errors.js';
import { retrieveKnowledge, storeKnowledge } from '../../lib/rag.js';
import { getTopAssets, getStockQuotes, resolveTokenPrice, searchDexScreener } from '../../lib/market-scanner.js';
import { getVideoInfo, getTranscript } from '../../lib/youtube.js';
// ─── Prompt Cleaning (strips AI markdown so bot prompts are human-readable) ─────
/**
 * Strips raw AI markdown syntax so the text shown in the BotBuilder prompt
 * field (and stored in DB) is clean, human-readable prose.
 * Removes: **bold**, *italic*, __underline__, # headers, ` backtick `,
 * ```fenced blocks```, leading bullet/dash markers, and excess whitespace.
 */
function cleanPromptForDisplay(text) {
    return text
        // Remove strategy-json and other fenced code blocks entirely
        .replace(/```[\w-]*[\s\S]*?```/g, '')
        // Remove # heading markers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic markers (**text**, *text*, __text__, _text_)
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
        // Remove inline backticks
        .replace(/`([^`]+)`/g, '$1')
        // Remove leading bullet/dash markers
        .replace(/^[\s]*[-*•]\s+/gm, '')
        // Collapse multiple blank lines to one
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
// ─── System Prompts ──────────────────────────────────────────────────────────
const TRADING_ASSISTANT_SYSTEM = `You are a sharp, knowledgeable trading assistant built into BotTradeApp. You help traders with crypto and stocks — strategies, chart analysis, market data, risk management, and building automated bots.

Personality: Direct, clear, and genuinely helpful. Skip filler phrases like "Great question!", "Thank you for providing", "As an AI language model", or "I'd be happy to help". Just answer. Be conversational but precise.

When you have live market data in context, use the exact numbers — never say you lack real-time access when the data is right there. If data is missing for something asked, say so briefly and give your best analysis from knowledge.

For bot strategies: give your explanation, then include a JSON block fenced as \`\`\`strategy-json\`\`\` with this shape:
{ "name": string, "strategy": string, "assetClass": "crypto"|"stocks", "pairs": string[], "riskLevel": "Very Low"|"Low"|"Med"|"High"|"Very High", "stopLoss": number, "takeProfit": number, "tradingFrequency": "conservative"|"balanced"|"aggressive"|"max", "aiMode": "rules_only"|"hybrid"|"full_ai", "maxOpenPositions": number, "tradingSchedule": "24_7"|"us_hours", "backtestEstimate": { "return30d": number, "winRate": number, "maxDrawdown": number } }

Rules:
- Crypto pairs: slash format ["BTC/USDT"]. Stocks: plain tickers ["AAPL"]. Never mix.
- Stock strategies always use tradingSchedule "us_hours". Crypto always "24_7".
- Scalping → tradingFrequency "max"/"aggressive". Swing/trend → "balanced"/"conservative". DCA/grid → "conservative".
- Grid/DCA → aiMode "rules_only". Most strategies → "hybrid". Explicit AI-driven → "full_ai".
- If an image is attached, treat it as a trading chart. Identify patterns, support/resistance, and setups.
- Only discuss trading, markets, finance, investing, and related technical topics. For off-topic requests, redirect once and move on.
- Never guarantee profits. Never help with market manipulation, pump-and-dump, or anything illegal.
- DYOR disclaimer when relevant, but keep it brief — one line is enough.`;
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
  "assetClass": "crypto" | "stocks",
  "pairs": string[] (crypto: ["BTC/USDT", "ETH/USDT"], stocks: ["AAPL", "TSLA"]),
  "riskLevel": "Very Low" | "Low" | "Med" | "High" | "Very High",
  "stopLoss": number (percentage, e.g., 3.5 means 3.5%),
  "takeProfit": number (percentage),
  "maxPositionSize": number (percentage of portfolio, e.g., 10 means 10%),
  "tradingFrequency": "conservative" | "balanced" | "aggressive" | "max",
  "aiMode": "rules_only" | "hybrid" | "full_ai",
  "maxOpenPositions": number (1-5),
  "tradingSchedule": "24_7" | "us_hours",
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
- If riskLevel is not specified, infer it from the description.
- tradingFrequency: Scalping → "max"; Momentum/Breakout high risk → "aggressive"; Momentum/Trend balanced → "balanced"; DCA/Grid/Swing → "conservative".
- aiMode: Grid/DCA → "rules_only"; most strategies → "hybrid"; explicitly AI-driven requests → "full_ai".
- tradingSchedule: stocks ALWAYS "us_hours"; crypto ALWAYS "24_7".
- maxOpenPositions: scalping → 1-2; diversified → 3-5; DCA/grid → 1.
- IMPORTANT: For crypto pairs use slash format ["BTC/USDT"]. For stocks use plain tickers ["AAPL"]. NEVER mix.`;
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
// ─── Content Moderation ──────────────────────────────────────────────────────
const BLOCKED_TOPICS = [
    // Violence, illegal activity
    /\b(kill|murder|bomb|weapon|hack\s+into|steal|illegal|drug\s+deal|launder)/i,
    // Sexual content
    /\b(porn|nude|nsfw|sexual|xxx)\b/i,
    // Scam/fraud instructions
    /\b(pump\s+and\s+dump|rug\s+pull\s+how|insider\s+trading\s+tip|manipulat(e|ing)\s+market|front\s+run)/i,
    // Completely off-topic
    /\b(write\s+me\s+(a\s+)?(poem|song|story|essay)|cook|recipe|homework|dating\s+advice)\b/i,
];
const OFF_TOPIC_PATTERNS = [
    // Non-finance topics (only block if clearly not trading-related)
    /\b(astrology|horoscope|fortune\s+telling|psychic|magic\s+spell)\b/i,
];
function moderateMessage(message) {
    const msg = message.toLowerCase().trim();
    // Check blocked topics
    for (const pattern of BLOCKED_TOPICS) {
        if (pattern.test(msg)) {
            return {
                blocked: true,
                reason: 'inappropriate_content',
                reply: '⚠️ I\'m a trading and financial markets assistant. I can\'t help with that topic. Please ask me about trading strategies, market analysis, portfolio management, or anything related to finance and investing.',
            };
        }
    }
    // Check off-topic (softer block)
    for (const pattern of OFF_TOPIC_PATTERNS) {
        if (pattern.test(msg)) {
            return {
                blocked: true,
                reason: 'off_topic',
                reply: '🔄 That\'s outside my area of expertise. I\'m specialized in trading and financial markets. Try asking me about:\n\n• Market analysis & trends\n• Trading strategies (RSI, MACD, etc.)\n• Portfolio management\n• Crypto/stock insights\n• Risk management\n\nHow can I help you with trading?',
            };
        }
    }
    return { blocked: false, reply: '' };
}
// ─── Image Validation ────────────────────────────────────────────────────────
const IMAGE_VALIDATION_PROMPT = `Analyze this image and determine if it is a valid trading/financial chart or market-related image.

Respond with ONLY a JSON object:
{
  "isValid": true/false,
  "type": "candlestick_chart" | "line_chart" | "indicator_chart" | "portfolio_screenshot" | "trading_interface" | "financial_data" | "not_trading_related",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Valid images include: candlestick charts, line charts, trading platform screenshots, technical indicator charts, portfolio screenshots, order book screenshots, financial data tables, heatmaps, etc.

Invalid images include: selfies, food, pets, memes, random photos, logos not related to trading, etc.`;
async function validateTrainingImage(imageUrl) {
    try {
        const response = await llmChat([{ role: 'user', content: 'Validate this image.' }], { system: IMAGE_VALIDATION_PROMPT, imageUrl, maxTokens: 200, temperature: 0.1 });
        const text = response.text || '';
        // Try to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                valid: result.isValid === true && result.confidence > 0.5,
                type: result.type || 'unknown',
                reason: result.reason || '',
            };
        }
    }
    catch (err) {
        console.warn('[ImageValidation] Failed:', err);
    }
    // Default: allow (don't block if validation fails)
    return { valid: true, type: 'unknown', reason: 'Validation unavailable' };
}
// ─── Training Content Validation ─────────────────────────────────────────────
function validateTrainingContent(content) {
    const text = content.toLowerCase();
    // Too short to be useful
    if (content.trim().length < 20) {
        return { valid: false, reason: 'Content is too short to be useful for training.' };
    }
    // Check for harmful training content
    for (const pattern of BLOCKED_TOPICS) {
        if (pattern.test(text)) {
            return { valid: false, reason: 'This content is not appropriate for bot training.' };
        }
    }
    // Content must contain trading/finance keywords regardless of length
    const financeKeywords = /\b(trade|trading|stock|crypto|bitcoin|ethereum|market|price|chart|candlestick|indicator|strategy|portfolio|profit|loss|buy|sell|position|risk|volume|trend|bullish|bearish|support|resistance|moving\s+average|rsi|macd|ema|sma|candle|exchange|wallet|token|coin|forex|futures|options|hedge|leverage|margin|order|bid|ask|spread|breakout|fibonacci|momentum|scalp|swing|equity|etf|ticker|yield)\b/i;
    if (!financeKeywords.test(text)) {
        return { valid: false, reason: 'Content does not appear to be related to trading or finance. Only upload trading strategies, chart analysis, or financial documents.' };
    }
    return { valid: true, reason: '' };
}
// Export for use in training service
export { validateTrainingImage, validateTrainingContent };
// ─── OpenAI Agentic Tool Definitions ────────────────────────────────────────
const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_crypto_price',
            description: 'Get live price, 24h change, volume for one or more crypto tokens or pairs. Works for any coin — major (BTC, ETH, SOL) or obscure DeFi tokens via DexScreener fallback.',
            parameters: {
                type: 'object',
                properties: {
                    symbols: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Crypto symbols or pairs to look up. Examples: ["BTC", "ETH/USDT", "PEPE", "WIF"]',
                    },
                },
                required: ['symbols'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_stock_price',
            description: 'Get live price and stats for US stock tickers via Alpaca.',
            parameters: {
                type: 'object',
                properties: {
                    symbols: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Stock tickers. Examples: ["AAPL", "NVDA", "TSLA"]',
                    },
                },
                required: ['symbols'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_dexscreener',
            description: 'Search DexScreener for a token by name or ticker. Use when a user asks about a DEX token, new launch, or obscure coin not on major exchanges.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Token name or ticker to search for. Example: "Bonk" or "BONK"',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_market_overview',
            description: 'Get top performing crypto or stock assets right now — useful for "top coins", "best performers", "trending", "gainers/losers" queries.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['crypto', 'stocks'],
                        description: 'Whether to get crypto or stock market overview',
                    },
                    limit: {
                        type: 'number',
                        description: 'How many assets to return (max 20). Default 10.',
                    },
                },
                required: ['type'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_knowledge_base',
            description: 'Search the user\'s personal knowledge base — documents, uploaded PDFs, YouTube videos they\'ve trained their bots with. Use when the user asks about something they previously uploaded or when context from their training data would help.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'What to search for in the knowledge base',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'Search the web for recent news, events, or information about a company, token, or market topic. Use for questions about recent news, earnings, announcements, or anything that may have happened recently.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query. Be specific. Examples: "NVDA earnings Q1 2025", "Bitcoin ETF news today", "Solana network outage"',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'fetch_youtube',
            description: 'Fetch a YouTube video, classify if it is trading-related, then store it in the knowledge base for future reference. Use whenever the user sends a YouTube URL in the chat.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Full YouTube URL. Example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
                    },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_bot_context',
            description: 'Get details about a specific trading bot — its strategy, pairs, risk level, and performance stats. Use when the user asks about their bot or wants to build on an existing bot.',
            parameters: {
                type: 'object',
                properties: {
                    botId: {
                        type: 'string',
                        description: 'The bot ID to look up',
                    },
                },
                required: ['botId'],
            },
        },
    },
];
// ─── Tool Executor ───────────────────────────────────────────────────────────
async function executeToolCall(toolName, args, userId, botId) {
    const t0 = Date.now();
    console.log(`[AI:tool] → ${toolName}`, JSON.stringify(args));
    try {
        let result;
        switch (toolName) {
            case 'get_crypto_price': {
                const symbols = args.symbols ?? [];
                const lines = [];
                for (const sym of symbols.slice(0, 6)) {
                    try {
                        const data = await resolveTokenPrice(sym);
                        if (data) {
                            const priceStr = data.price < 0.01 ? `$${data.price.toFixed(8)}`
                                : data.price < 1 ? `$${data.price.toFixed(6)}`
                                    : `$${data.price.toFixed(2)}`;
                            let line = `${data.symbol}: ${priceStr} | 24h: ${data.change24h >= 0 ? '+' : ''}${data.change24h.toFixed(2)}%`;
                            if (data.volume24h)
                                line += ` | Vol: $${(data.volume24h / 1_000_000).toFixed(1)}M`;
                            if (data.source === 'dexscreener') {
                                if (data.chain)
                                    line += ` | Chain: ${data.chain}`;
                                if (data.liquidity)
                                    line += ` | Liq: $${(data.liquidity / 1_000).toFixed(0)}K`;
                                if (data.marketCap && data.marketCap > 0)
                                    line += ` | MCap: $${(data.marketCap / 1_000_000).toFixed(1)}M`;
                            }
                            lines.push(line);
                        }
                        else {
                            lines.push(`${sym}: price not available`);
                        }
                    }
                    catch {
                        lines.push(`${sym}: lookup failed`);
                    }
                }
                result = lines.length > 0 ? `Live crypto prices:\n${lines.join('\n')}` : 'No price data found.';
                break;
            }
            case 'get_stock_price': {
                const symbols = args.symbols ?? [];
                const quotes = await getStockQuotes(symbols.slice(0, 6));
                if (quotes.length === 0) {
                    result = 'No stock data found. Market may be closed or symbols may be invalid.';
                }
                else {
                    const lines = quotes.map(q => `${q.symbol}: $${q.price.toFixed(2)} | ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% | High: $${q.high.toFixed(2)} | Low: $${q.low.toFixed(2)} | Vol: ${(q.volume / 1_000_000).toFixed(1)}M`);
                    result = `Live stock prices:\n${lines.join('\n')}`;
                }
                break;
            }
            case 'search_dexscreener': {
                const query = args.query ?? '';
                const results = await searchDexScreener(query);
                if (results.length === 0) {
                    result = `No DexScreener results for "${query}".`;
                }
                else {
                    const best = results[0];
                    const priceStr = best.price < 0.01 ? `$${best.price.toFixed(8)}`
                        : best.price < 1 ? `$${best.price.toFixed(6)}`
                            : `$${best.price.toFixed(2)}`;
                    result = `${best.name} (${best.symbol}) on ${best.chain} via ${best.dexName}:\n` +
                        `Price: ${priceStr} | 24h: ${best.change24h >= 0 ? '+' : ''}${best.change24h.toFixed(2)}%\n` +
                        `Vol: $${(best.volume24h / 1_000).toFixed(0)}K | Liq: $${(best.liquidity / 1_000).toFixed(0)}K\n` +
                        (best.marketCap > 0 ? `MCap: $${(best.marketCap / 1_000_000).toFixed(2)}M\n` : '') +
                        `Buys: ${best.txns24h.buys} | Sells: ${best.txns24h.sells}` +
                        (results.length > 1 ? `\nOther pairs: ${results.slice(1, 4).map(r => `${r.symbol} on ${r.chain} @ ${r.price < 1 ? '$' + r.price.toFixed(6) : '$' + r.price.toFixed(4)}`).join(', ')}` : '');
                }
                break;
            }
            case 'get_market_overview': {
                const assetType = args.type ?? 'crypto';
                const limit = Math.min(Number(args.limit ?? 10), 20);
                if (assetType === 'stocks') {
                    const topStocks = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'NFLX', 'SPY', 'QQQ', 'COIN'];
                    const quotes = await getStockQuotes(topStocks.slice(0, limit));
                    if (quotes.length === 0) {
                        result = 'Stock market data unavailable right now.';
                    }
                    else {
                        const sorted = [...quotes].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
                        result = `Top ${sorted.length} US stocks by movement:\n` +
                            sorted.map((q, i) => `${i + 1}. ${q.symbol}: $${q.price.toFixed(2)} | ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% | Vol: ${(q.volume / 1_000_000).toFixed(1)}M`).join('\n');
                    }
                }
                else {
                    const assets = await getTopAssets(limit);
                    result = `Top ${assets.length} crypto by momentum:\n` +
                        assets.map((a, i) => `${i + 1}. ${a.symbol}: $${a.price < 1 ? a.price.toFixed(4) : a.price.toFixed(2)} | 24h: ${a.change24h >= 0 ? '+' : ''}${a.change24h.toFixed(2)}% | Vol: $${(a.volume24h / 1_000_000).toFixed(1)}M`).join('\n');
                }
                break;
            }
            case 'search_knowledge_base': {
                const query = args.query ?? '';
                // Bot training RAG is separate: if botId provided, only search bot-specific knowledge.
                // General chatbot RAG: search user-wide knowledge that is NOT bot-specific (botId IS NULL).
                const knowledge = await retrieveKnowledge({
                    userId,
                    botId: botId || undefined,
                    query,
                    topK: 6,
                });
                if (knowledge.length === 0) {
                    result = 'No relevant content found in knowledge base for this query.';
                }
                else {
                    result = `Found ${knowledge.length} relevant items from your knowledge base:\n\n` +
                        knowledge.map((k, i) => `[${i + 1}] Source: ${k.sourceType} | Score: ${k.score.toFixed(2)}\n${k.content.substring(0, 600)}`).join('\n---\n');
                }
                break;
            }
            case 'get_bot_context': {
                const lookupBotId = args.botId ?? botId ?? '';
                if (!lookupBotId) {
                    result = 'No bot ID provided.';
                    break;
                }
                const [bot] = await db.select().from(bots).where(eq(bots.id, lookupBotId)).limit(1);
                if (!bot) {
                    result = 'Bot not found.';
                    break;
                }
                const [stats] = await db.select().from(botStatistics).where(eq(botStatistics.botId, lookupBotId)).limit(1);
                const cfg = bot.config || {};
                result = `Bot: ${bot.name}\nStrategy: ${bot.strategy}\nRisk: ${bot.riskLevel}\nAsset Class: ${bot.category || 'Crypto'}\n` +
                    `Pairs: ${cfg.pairs?.join(', ') || 'N/A'}\nAI Mode: ${cfg.aiMode || 'hybrid'}\nFrequency: ${cfg.tradingFrequency || 'balanced'}`;
                if (stats) {
                    result += `\n30d Return: ${stats.return30d}% | Win Rate: ${stats.winRate}% | Max Drawdown: ${stats.maxDrawdown}%`;
                }
                break;
            }
            case 'search_web': {
                const query = args.query ?? '';
                if (!query) {
                    result = 'No search query provided.';
                    break;
                }
                if (!env.BRAVE_SEARCH_API_KEY) {
                    result = 'Web search is not configured (BRAVE_SEARCH_API_KEY missing). Answer based on your training knowledge and note it may not be current.';
                    break;
                }
                try {
                    const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=en&freshness=pw`, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY } });
                    if (!searchRes.ok)
                        throw new Error(`Brave API ${searchRes.status}`);
                    const data = await searchRes.json();
                    const webResults = data?.web?.results ?? [];
                    if (webResults.length === 0) {
                        result = `No web results found for "${query}".`;
                        break;
                    }
                    result = `Web search results for "${query}":\n\n` +
                        webResults.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description?.substring(0, 200) ?? ''}`).join('\n\n');
                }
                catch (err) {
                    result = `Web search failed: ${err.message}. Answer based on training knowledge.`;
                }
                break;
            }
            case 'fetch_youtube': {
                const url = args.url ?? '';
                if (!url) {
                    result = 'No URL provided.';
                    break;
                }
                console.log(`[AI:tool] YouTube: fetching info for ${url}`);
                const videoInfo = await getVideoInfo(url);
                if (!videoInfo) {
                    result = `Could not fetch video info for ${url}. Check the URL and try again.`;
                    break;
                }
                const transcript = await getTranscript(url);
                const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                const videoId = videoIdMatch?.[1] ?? url;
                // Classify with AI
                const classifyCtx = [
                    `Title: ${videoInfo.title}`,
                    `Channel: ${videoInfo.channelTitle}`,
                    videoInfo.description ? `Description: ${videoInfo.description.substring(0, 500)}` : '',
                    transcript ? `Transcript excerpt: ${transcript.substring(0, 600)}` : '',
                ].filter(Boolean).join('\n');
                let isTradingRelated = true;
                let classifyReason = '';
                try {
                    const cr = await llmChat([{ role: 'user', content: `Determine if this YouTube video is about crypto, stocks, trading, or investing.\n\n${classifyCtx}\n\nRespond with exactly one line: "YES: <reason>" or "NO: <reason>".` }], { maxTokens: 60, temperature: 0 });
                    const crText = (cr.text ?? '').trim();
                    isTradingRelated = crText.toUpperCase().startsWith('YES');
                    classifyReason = crText.replace(/^(YES|NO):\s*/i, '').trim();
                }
                catch {
                    isTradingRelated = true;
                }
                if (!isTradingRelated) {
                    result = `Video "${videoInfo.title}" is not about trading or investing (${classifyReason}). I can only learn from crypto, stocks, or trading videos.`;
                    break;
                }
                // Store in RAG
                const content = `Video: ${videoInfo.title}\nChannel: ${videoInfo.channelTitle}\n${videoInfo.description || ''}\n${transcript || ''}`;
                let chunksStored = 0;
                if (content.length > 50) {
                    const { storeTrainingChunks } = await import('../../lib/rag.js');
                    chunksStored = await storeTrainingChunks({
                        userId,
                        botId: botId || undefined,
                        sourceType: 'youtube',
                        sourceId: videoId,
                        text: content,
                        metadata: { title: videoInfo.title, channel: videoInfo.channelTitle },
                    });
                }
                result = `Learned from "${videoInfo.title}" by ${videoInfo.channelTitle}.\n` +
                    `${transcript ? 'Full transcript available.' : 'No transcript — stored title and description only.'}\n` +
                    `Stored ${chunksStored} knowledge chunks.\n` +
                    (transcript ? `\nKey content excerpt:\n${transcript.substring(0, 1500)}` : `\nDescription: ${videoInfo.description?.substring(0, 800) || 'N/A'}`);
                break;
            }
            default:
                result = `Unknown tool: ${toolName}`;
        }
        console.log(`[AI:tool] ✓ ${toolName} completed in ${Date.now() - t0}ms`);
        return result;
    }
    catch (err) {
        console.error(`[AI:tool] ✗ ${toolName} failed in ${Date.now() - t0}ms:`, err.message);
        return `Tool ${toolName} failed: ${err.message}`;
    }
}
// ─── Context Window Manager ──────────────────────────────────────────────────
// When a conversation grows beyond SUMMARIZE_AFTER turns, compress the oldest
// half into a single summary turn to stay well within the 128K context limit.
const SUMMARIZE_AFTER = 16; // turns before compression kicks in
async function compressHistory(history) {
    if (history.length <= SUMMARIZE_AFTER)
        return history;
    // Keep the newest 8 turns verbatim; summarize everything older
    const toSummarize = history.slice(0, history.length - 8);
    const toKeep = history.slice(history.length - 8);
    console.log(`[AI:context] Compressing ${toSummarize.length} turns into summary`);
    const summaryPrompt = toSummarize
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 400)}`)
        .join('\n');
    try {
        const summaryResp = await llmChat([{ role: 'user', content: `Summarize this conversation exchange in 3-5 concise bullet points, focusing on what was discussed, any trading strategies mentioned, and key decisions made:\n\n${summaryPrompt}` }], { maxTokens: 400, temperature: 0 });
        const summaryMsg = {
            role: 'assistant',
            content: `[Earlier conversation summary: ${summaryResp.text.trim()}]`,
        };
        console.log(`[AI:context] Compressed ${toSummarize.length} turns → 1 summary`);
        return [summaryMsg, ...toKeep];
    }
    catch {
        // If summarization fails, just drop the oldest turns
        console.warn('[AI:context] Summarization failed, dropping oldest turns');
        return toKeep;
    }
}
// ─── Gemini Fallback Chat ─────────────────────────────────────────────────────
async function fallbackChat(systemPrompt, messages, imageUrl) {
    console.log('[AI:chat] OpenAI unavailable, falling back to Gemini/Anthropic');
    const response = await llmChat(messages, {
        system: systemPrompt,
        maxTokens: 4096,
        imageUrl,
    });
    return { text: response.text, model: `${response.provider}:${response.model}` };
}
// ─── Service Functions ───────────────────────────────────────────────────────
export async function chat(userId, message, conversationId, attachmentUrl, botId) {
    const convId = conversationId ?? crypto.randomUUID();
    // Ensure conversations row exists for this chat
    await ensureConversation(userId, convId);
    console.log(`\n[AI:chat] ── New request ──────────────────────────────────`);
    console.log(`[AI:chat] userId=${userId} | convId=${convId} | botId=${botId ?? 'none'} | hasImage=${!!attachmentUrl}`);
    console.log(`[AI:chat] message: "${message.substring(0, 120)}${message.length > 120 ? '...' : ''}"`);
    // --- CONTENT MODERATION ---
    const moderationResult = moderateMessage(message);
    if (moderationResult.blocked) {
        console.log(`[AI:chat] Blocked by moderation: ${moderationResult.reason}`);
        await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'user', content: message, metadata: { blocked: true, reason: moderationResult.reason } });
        await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'assistant', content: moderationResult.reply, metadata: { blocked: true } });
        return { reply: moderationResult.reply, conversationId: convId, provider: 'moderation', model: 'content-filter' };
    }
    // --- IMAGE VALIDATION ---
    if (attachmentUrl) {
        console.log(`[AI:chat] Validating image: ${attachmentUrl}`);
        try {
            const imgValidation = await validateTrainingImage(attachmentUrl);
            if (!imgValidation.valid) {
                const rejectReply = `This image doesn't look like a trading chart or financial data (detected: ${imgValidation.type}). ${imgValidation.reason} Please upload a chart screenshot or trading interface.`;
                await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'user', content: `[Image: ${attachmentUrl}] ${message}`, metadata: { attachmentUrl, rejected: true } });
                await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'assistant', content: rejectReply, metadata: { imageRejected: true } });
                return { reply: rejectReply, conversationId: convId, provider: 'moderation', model: 'image-filter' };
            }
            console.log(`[AI:chat] Image validated: type=${imgValidation.type}`);
        }
        catch { }
    }
    // --- LOAD CONVERSATION HISTORY (current conversation only, with compression) ---
    const history = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, convId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(40);
    const rawHistory = history.reverse().map((m) => ({
        role: m.role,
        content: m.content,
    }));
    // Compress if conversation is long
    const priorMessages = await compressHistory(rawHistory);
    console.log(`[AI:chat] Loaded ${rawHistory.length} prior messages (${priorMessages.length} after compression)`);
    // --- BUILD SYSTEM PROMPT ---
    // Bot context injected only when botId is provided
    let botContextSection = '';
    if (botId) {
        try {
            const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
            if (bot) {
                const [stats] = await db.select().from(botStatistics).where(eq(botStatistics.botId, botId)).limit(1);
                const cfg = bot.config || {};
                botContextSection = `\n\nActive Bot: ${bot.name} | Strategy: ${bot.strategy} | Risk: ${bot.riskLevel} | Asset Class: ${bot.category || 'Crypto'} | Pairs: ${cfg.pairs?.join(', ') || 'N/A'} | AI Mode: ${cfg.aiMode || 'hybrid'} | Frequency: ${cfg.tradingFrequency || 'balanced'}`;
                if (stats) {
                    botContextSection += ` | 30d Return: ${stats.return30d}% | Win Rate: ${stats.winRate}% | Drawdown: ${stats.maxDrawdown}%`;
                }
                console.log(`[AI:chat] Bot context loaded: ${bot.name}`);
            }
        }
        catch (err) {
            console.warn('[AI:chat] Failed to load bot context:', err);
        }
    }
    const systemPrompt = TRADING_ASSISTANT_SYSTEM + botContextSection +
        `\n\nTools available: get_crypto_price, get_stock_price, search_dexscreener, get_market_overview, search_knowledge_base, get_bot_context, fetch_youtube, search_web. Rules: (1) Always call fetch_youtube when the user sends a YouTube URL. (2) Use price tools for any price/market question — never guess prices. (3) Use search_web for news, recent events, earnings, or anything time-sensitive. (4) Use search_knowledge_base when user asks about previously uploaded content.`;
    // --- BUILD MESSAGES FOR OPENAI ---
    const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...priorMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
    ];
    // --- AGENTIC CALL (OpenAI primary, fallback to Gemini/Anthropic) ---
    let replyText;
    let modelUsed;
    let toolsUsed = [];
    try {
        const boundExec = (name, args) => executeToolCall(name, args, userId, botId);
        const agentResult = await runAgenticLoop(openaiMessages, attachmentUrl, boundExec);
        replyText = agentResult.text;
        modelUsed = agentResult.model;
        toolsUsed = agentResult.toolsUsed;
    }
    catch (err) {
        console.error('[AI:chat] OpenAI agentic call failed:', err.message);
        // Fallback to non-agentic provider
        try {
            const fbResult = await fallbackChat(systemPrompt, [
                ...priorMessages,
                { role: 'user', content: message },
            ], attachmentUrl);
            replyText = fbResult.text;
            modelUsed = fbResult.model;
        }
        catch (fbErr) {
            console.error('[AI:chat] Fallback also failed:', fbErr.message);
            const msg = (err.message || '').toLowerCase();
            let friendlyMessage = 'I\'m having trouble connecting right now. Please try again in a moment.';
            if (msg.includes('timeout') || msg.includes('timed out'))
                friendlyMessage = 'That request timed out. Try a shorter message or try again.';
            else if (msg.includes('rate limit') || msg.includes('429'))
                friendlyMessage = 'The AI service is busy. Wait a moment and try again.';
            return { reply: friendlyMessage, conversationId: convId, provider: 'none', model: 'none', error: 'AI_UNAVAILABLE' };
        }
    }
    console.log(`[AI:chat] Response ready | model=${modelUsed} | tools=[${toolsUsed.join(', ')}] | length=${replyText.length}`);
    // --- STORE IMAGE ANALYSIS IN KNOWLEDGE BASE ---
    if (attachmentUrl) {
        storeKnowledge({
            userId,
            botId: botId || undefined,
            sourceType: 'image',
            sourceId: attachmentUrl,
            content: `Chart analysis: ${replyText.substring(0, 1000)}`,
            metadata: { attachmentUrl, conversationId: convId },
        }).catch(() => { });
    }
    // --- PERSIST MESSAGES ---
    await db.insert(chatMessages).values({
        userId,
        role: 'user',
        content: message,
        conversationId: convId,
        metadata: attachmentUrl ? { attachmentUrl } : null,
    });
    await db.insert(chatMessages).values({
        userId,
        role: 'assistant',
        content: replyText,
        conversationId: convId,
        metadata: { model: modelUsed, toolsUsed },
    });
    // --- EXTRACT STRATEGY PREVIEW ---
    let strategyPreview;
    const strategyMatch = replyText.match(/```strategy-json\s*([\s\S]*?)```/);
    if (strategyMatch) {
        try {
            strategyPreview = JSON.parse(strategyMatch[1].trim());
        }
        catch { }
    }
    // --- CLEAN REPLY FOR BOT BUILDER (capped at 2000 chars to stay within bot prompt budget) ---
    const cleanedReplyForStorage = cleanPromptForDisplay(replyText.replace(/```strategy-json[\s\S]*?```/g, '').trim()).substring(0, 2000);
    return {
        reply: replyText,
        conversationId: convId,
        provider: 'openai',
        model: modelUsed,
        cleanPrompt: cleanedReplyForStorage,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        ...(strategyPreview ? { strategyPreview } : {}),
    };
}
// ─── Agentic Loop (separated so it can receive bound tool executor) ──────────
async function runAgenticLoop(messages, imageUrl, execTool) {
    if (!env.OPENAI_API_KEY) {
        throw new AppError(503, 'OpenAI API key not configured.', 'AI_UNAVAILABLE');
    }
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const model = 'gpt-4.1-mini';
    const toolsUsed = [];
    const runMessages = [...messages];
    // Inject image into last user message if provided
    if (imageUrl) {
        const lastUserIdx = [...runMessages].map(m => m.role).lastIndexOf('user');
        if (lastUserIdx !== -1) {
            const lastUser = runMessages[lastUserIdx];
            const textContent = typeof lastUser.content === 'string' ? lastUser.content : '';
            let imgUrl = imageUrl;
            try {
                const fs = await import('fs');
                const path = await import('path');
                let filePath = imageUrl;
                if (filePath.startsWith('/uploads/'))
                    filePath = path.join(process.cwd(), filePath);
                if (fs.existsSync(filePath)) {
                    const buffer = fs.readFileSync(filePath);
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
                    imgUrl = `data:${mimeMap[ext] || 'image/jpeg'};base64,${buffer.toString('base64')}`;
                }
            }
            catch { }
            runMessages[lastUserIdx] = {
                role: 'user',
                content: [
                    { type: 'text', text: textContent },
                    { type: 'image_url', image_url: { url: imgUrl } },
                ],
            };
        }
    }
    console.log(`[AI:agent] Starting loop | model=${model} | messages=${runMessages.length}`);
    const t0 = Date.now();
    for (let round = 0; round < 5; round++) {
        const response = await client.chat.completions.create({
            model,
            messages: runMessages,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
            max_completion_tokens: 4096,
            temperature: 0.7,
        });
        const choice = response.choices[0];
        const assistantMsg = choice.message;
        runMessages.push(assistantMsg);
        if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
            console.log(`[AI:agent] Round ${round + 1}: ${assistantMsg.tool_calls.length} tool call(s) requested`);
            // Execute all tool calls in parallel
            const toolResults = await Promise.all(assistantMsg.tool_calls.map(async (tc) => {
                if (!toolsUsed.includes(tc.function.name))
                    toolsUsed.push(tc.function.name);
                let parsed = {};
                try {
                    parsed = JSON.parse(tc.function.arguments);
                }
                catch { }
                const result = await execTool(tc.function.name, parsed);
                return { tool_call_id: tc.id, content: result };
            }));
            for (const tr of toolResults) {
                runMessages.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
            }
            continue;
        }
        const text = assistantMsg.content ?? '';
        console.log(`[AI:agent] Completed | rounds=${round + 1} | tools=[${toolsUsed.join(', ')}] | ms=${Date.now() - t0} | tokens=${response.usage?.total_tokens ?? '?'}`);
        return { text, model, toolsUsed };
    }
    // Max rounds: final pass without tools
    console.warn('[AI:agent] Max rounds reached, forcing final answer');
    const finalResponse = await client.chat.completions.create({ model, messages: runMessages, max_completion_tokens: 2048 });
    return { text: finalResponse.choices[0]?.message?.content ?? '', model, toolsUsed };
}
// ─── Streaming Agentic Loop ──────────────────────────────────────────────────
// Same as runAgenticLoop but streams the final text round.
// Tool rounds execute normally (non-streaming).
// Yields SSE-formatted strings: "data: {...}\n\n"
export async function* chatStream(userId, message, conversationId, attachmentUrl, botId) {
    const convId = conversationId ?? crypto.randomUUID();
    // Ensure conversations row exists for this chat
    await ensureConversation(userId, convId);
    console.log(`\n[AI:stream] ── New stream request ───────────────────────────`);
    console.log(`[AI:stream] userId=${userId} | convId=${convId} | botId=${botId ?? 'none'}`);
    // --- CONTENT MODERATION ---
    const moderationResult = moderateMessage(message);
    if (moderationResult.blocked) {
        await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'user', content: message, metadata: { blocked: true } });
        await db.insert(chatMessages).values({ userId, conversationId: convId, role: 'assistant', content: moderationResult.reply, metadata: { blocked: true } });
        yield `data: ${JSON.stringify({ token: moderationResult.reply })}\n\n`;
        yield `data: ${JSON.stringify({ done: true, conversationId: convId, model: 'content-filter' })}\n\n`;
        return;
    }
    // --- LOAD CONVERSATION HISTORY ---
    const history = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, convId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(40);
    const rawHistory = history.reverse().map(m => ({ role: m.role, content: m.content }));
    const priorMessages = await compressHistory(rawHistory);
    // --- BOT CONTEXT ---
    let botContextSection = '';
    if (botId) {
        try {
            const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
            if (bot) {
                const [stats] = await db.select().from(botStatistics).where(eq(botStatistics.botId, botId)).limit(1);
                const cfg = bot.config || {};
                botContextSection = `\n\nActive Bot: ${bot.name} | Strategy: ${bot.strategy} | Risk: ${bot.riskLevel} | Asset Class: ${bot.category || 'Crypto'} | Pairs: ${cfg.pairs?.join(', ') || 'N/A'} | AI Mode: ${cfg.aiMode || 'hybrid'} | Frequency: ${cfg.tradingFrequency || 'balanced'}`;
                if (stats)
                    botContextSection += ` | 30d Return: ${stats.return30d}% | Win Rate: ${stats.winRate}% | Drawdown: ${stats.maxDrawdown}%`;
            }
        }
        catch { }
    }
    const systemPrompt = TRADING_ASSISTANT_SYSTEM + botContextSection +
        `\n\nTools available: get_crypto_price, get_stock_price, search_dexscreener, get_market_overview, search_knowledge_base, get_bot_context, fetch_youtube, search_web. Rules: (1) Always call fetch_youtube when the user sends a YouTube URL. (2) Use price tools for any price/market question — never guess prices. (3) Use search_web for news, recent events, earnings, or anything time-sensitive. (4) Use search_knowledge_base when user asks about previously uploaded content.`;
    const openaiMessages = [
        { role: 'system', content: systemPrompt },
        ...priorMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
    ];
    // --- SINGLE STREAMING CALL — tools + text in one pass per round ---
    // Every round uses stream:true. If the model calls a tool, we collect the
    // streamed tool-call arguments, execute the tool, then start the next round.
    // This means the first token of the final answer starts streaming immediately
    // after the last tool finishes — no wasted non-streaming probe call.
    let replyText = '';
    let modelUsed = 'gpt-4.1-mini';
    let toolsUsed = [];
    if (!env.OPENAI_API_KEY) {
        try {
            const fb = await fallbackChat(systemPrompt, [...priorMessages, { role: 'user', content: message }], attachmentUrl);
            replyText = fb.text;
            modelUsed = fb.model;
            yield `data: ${JSON.stringify({ token: replyText })}\n\n`;
        }
        catch {
            yield `data: ${JSON.stringify({ token: 'Sorry, I could not process your request.' })}\n\n`;
        }
    }
    else {
        const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
        const model = 'gpt-4.1-mini';
        const boundExec = (name, args) => executeToolCall(name, args, userId, botId);
        const runMessages = [...openaiMessages];
        for (let round = 0; round < 5; round++) {
            // Always stream — works for both tool-call rounds and final text rounds
            const stream = await client.chat.completions.create({
                model,
                messages: runMessages,
                tools: AGENT_TOOLS,
                tool_choice: 'auto',
                max_completion_tokens: 4096,
                temperature: 0.7,
                stream: true,
            });
            // Accumulate streamed chunks — either text tokens or tool-call arguments
            let roundText = '';
            let finishReason = '';
            // Map of tool call index → { id, name, args_so_far }
            const toolCallMap = {};
            for await (const chunk of stream) {
                const choice = chunk.choices?.[0];
                if (!choice)
                    continue;
                finishReason = choice.finish_reason || finishReason;
                const delta = choice.delta;
                if (delta?.content) {
                    // Text token — stream it immediately to the client
                    roundText += delta.content;
                    yield `data: ${JSON.stringify({ token: delta.content })}\n\n`;
                }
                // Tool call deltas — accumulate name + arguments across chunks
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallMap[idx])
                            toolCallMap[idx] = { id: '', name: '', args: '' };
                        if (tc.id)
                            toolCallMap[idx].id = tc.id;
                        if (tc.function?.name)
                            toolCallMap[idx].name += tc.function.name;
                        if (tc.function?.arguments)
                            toolCallMap[idx].args += tc.function.arguments;
                    }
                }
            }
            const toolCalls = Object.values(toolCallMap);
            if (finishReason === 'tool_calls' && toolCalls.length > 0) {
                // Notify UI which tools are running
                const toolNames = toolCalls.map(tc => tc.name).join(', ');
                yield `data: ${JSON.stringify({ tool: toolNames })}\n\n`;
                console.log(`[AI:stream] Round ${round + 1}: tools=[${toolNames}]`);
                // Push reconstructed assistant message (required by OpenAI API)
                runMessages.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.name, arguments: tc.args },
                    })),
                });
                // Execute all tools in parallel
                const results = await Promise.all(toolCalls.map(async (tc) => {
                    if (!toolsUsed.includes(tc.name))
                        toolsUsed.push(tc.name);
                    let parsed = {};
                    try {
                        parsed = JSON.parse(tc.args);
                    }
                    catch { }
                    const result = await boundExec(tc.name, parsed);
                    return { tool_call_id: tc.id, content: result };
                }));
                for (const tr of results) {
                    runMessages.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
                }
                continue; // next streaming round with tool results injected
            }
            // finish_reason === 'stop' — text was streamed token by token above
            replyText = roundText;
            break;
        }
        modelUsed = model;
    }
    console.log(`[AI:stream] Complete | model=${modelUsed} | tools=[${toolsUsed.join(', ')}] | length=${replyText.length}`);
    // --- PERSIST ---
    if (attachmentUrl)
        storeKnowledge({ userId, botId: botId || undefined, sourceType: 'image', sourceId: attachmentUrl, content: `Chart analysis: ${replyText.substring(0, 1000)}`, metadata: { attachmentUrl, conversationId: convId } }).catch(() => { });
    await db.insert(chatMessages).values({ userId, role: 'user', content: message, conversationId: convId, metadata: attachmentUrl ? { attachmentUrl } : null });
    await db.insert(chatMessages).values({ userId, role: 'assistant', content: replyText, conversationId: convId, metadata: { model: modelUsed, toolsUsed } });
    // --- EXTRACT STRATEGY ---
    let strategyPreview;
    const sm = replyText.match(/```strategy-json\s*([\s\S]*?)```/);
    if (sm) {
        try {
            strategyPreview = JSON.parse(sm[1].trim());
        }
        catch { }
    }
    const cleanPrompt = cleanPromptForDisplay(replyText.replace(/```strategy-json[\s\S]*?```/g, '').trim()).substring(0, 2000);
    // --- FINAL DONE EVENT ---
    yield `data: ${JSON.stringify({ done: true, conversationId: convId, model: modelUsed, toolsUsed: toolsUsed.length ? toolsUsed : undefined, cleanPrompt, ...(strategyPreview ? { strategyPreview } : {}) })}\n\n`;
}
export async function voiceCommand(userId, transcript) {
    let response;
    try {
        response = await llmChat([{ role: 'user', content: transcript }], {
            system: VOICE_COMMAND_SYSTEM,
            maxTokens: 512,
        });
    }
    catch (err) {
        console.error('[AI Voice] LLM call failed:', err.message);
        return {
            transcript,
            intent: 'error',
            action: 'general_query',
            reply: 'Voice processing is temporarily unavailable. Please try again.',
        };
    }
    const rawText = response.text;
    // Parse the JSON response
    let parsed;
    try {
        parsed = JSON.parse(rawText);
    }
    catch {
        // Try to extract JSON from markdown fence
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[1].trim());
            }
            catch {
                parsed = {
                    action: 'general_query',
                    params: { query: transcript },
                    naturalResponse: "I wasn't sure what you meant. Could you try rephrasing that?",
                };
            }
        }
        else {
            parsed = {
                action: 'general_query',
                params: { query: transcript },
                naturalResponse: "I wasn't sure what you meant. Could you try rephrasing that?",
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
export async function generateStrategy(userId, description, pairs, riskLevel) {
    const userPrompt = [
        `Create a trading strategy based on this description: "${description}"`,
        pairs?.length ? `Preferred trading pairs: ${pairs.join(', ')}` : null,
        riskLevel ? `Desired risk level: ${riskLevel}` : null,
    ]
        .filter(Boolean)
        .join('\n');
    const response = await llmChat([{ role: 'user', content: userPrompt }], {
        system: STRATEGY_GENERATOR_SYSTEM,
        maxTokens: 1500,
    });
    const rawText = response.text;
    let strategy;
    try {
        strategy = JSON.parse(rawText);
    }
    catch {
        // Try to extract JSON from response if wrapped in markdown
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                strategy = JSON.parse(jsonMatch[1].trim());
            }
            catch {
                throw new AppError(502, 'AI returned an invalid strategy format. Please try again.', 'AI_PARSE_ERROR');
            }
        }
        else {
            throw new AppError(502, 'AI returned an invalid strategy format. Please try again.', 'AI_PARSE_ERROR');
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
export async function getCreatorSuggestions(userId) {
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
                description: 'Start by creating a trading bot. Use the AI Strategy Generator to design a strategy based on your trading style.',
                category: 'strategy',
                priority: 'high',
            },
        ];
    }
    const botsData = JSON.stringify(creatorBots, null, 2);
    const response = await llmChat([
        {
            role: 'user',
            content: `Here are my bots and their performance data:\n\n${botsData}\n\nPlease analyze and provide improvement suggestions.`,
        },
    ], {
        system: CREATOR_SUGGESTIONS_SYSTEM,
        maxTokens: 1500,
    });
    const rawText = response.text;
    let suggestions;
    try {
        suggestions = JSON.parse(rawText);
    }
    catch {
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                suggestions = JSON.parse(jsonMatch[1].trim());
            }
            catch {
                suggestions = [
                    {
                        id: 'sug_fallback',
                        title: 'Review Bot Performance',
                        description: "Check your bots' recent performance metrics and consider adjusting parameters for underperforming strategies.",
                        category: 'performance',
                        priority: 'medium',
                    },
                ];
            }
        }
        else {
            suggestions = [
                {
                    id: 'sug_fallback',
                    title: 'Review Bot Performance',
                    description: "Check your bots' recent performance metrics and consider adjusting parameters for underperforming strategies.",
                    category: 'performance',
                    priority: 'medium',
                },
            ];
        }
    }
    return suggestions;
}
// ─── Conversations ───────────────────────────────────────────────────────────
// Ensure a conversations row exists for a given convId; create it if not.
// Called on the first message of a new chat. Uses INSERT … ON CONFLICT DO NOTHING.
async function ensureConversation(userId, convId) {
    await db
        .insert(conversations)
        .values({ id: convId, userId })
        .onConflictDoNothing();
}
// List all conversations for a user
export async function listConversations(userId) {
    // Get distinct conversationIds with stats
    const convStats = await db
        .select({
        conversationId: chatMessages.conversationId,
        createdAt: sql `min(${chatMessages.createdAt})`,
        lastMessageAt: sql `max(${chatMessages.createdAt})`,
        messageCount: sql `count(*)::int`,
    })
        .from(chatMessages)
        .where(eq(chatMessages.userId, userId))
        .groupBy(chatMessages.conversationId)
        .orderBy(desc(sql `max(${chatMessages.createdAt})`))
        .limit(50);
    // Get stored titles from conversations table
    const storedTitles = await db
        .select({ id: conversations.id, title: conversations.title })
        .from(conversations)
        .where(eq(conversations.userId, userId));
    const titleMap = new Map(storedTitles.map(c => [c.id, c.title]));
    // Build result — use stored title if set, else fall back to first user message substring
    const result = [];
    for (const conv of convStats) {
        let title = titleMap.get(conv.conversationId) ?? null;
        if (!title) {
            const [firstMsg] = await db
                .select({ content: chatMessages.content })
                .from(chatMessages)
                .where(and(eq(chatMessages.conversationId, conv.conversationId), eq(chatMessages.role, 'user')))
                .orderBy(chatMessages.createdAt)
                .limit(1);
            title = firstMsg?.content?.substring(0, 80) || 'New conversation';
        }
        result.push({
            id: conv.conversationId,
            title,
            messageCount: conv.messageCount,
            createdAt: conv.createdAt,
            lastMessageAt: conv.lastMessageAt,
        });
    }
    return result;
}
// Rename a conversation
export async function renameConversation(userId, conversationId, title) {
    const trimmed = title.trim().substring(0, 120);
    if (!trimmed)
        throw new Error('Title cannot be empty');
    // Upsert: if conversations row exists update it, else create it
    await db
        .insert(conversations)
        .values({ id: conversationId, userId, title: trimmed })
        .onConflictDoUpdate({
        target: conversations.id,
        set: { title: trimmed, updatedAt: sql `now()` },
    });
    return { conversationId, title: trimmed };
}
// Load a specific conversation
export async function getConversation(userId, conversationId) {
    const messages = await db
        .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        metadata: chatMessages.metadata,
        createdAt: chatMessages.createdAt,
    })
        .from(chatMessages)
        .where(and(eq(chatMessages.userId, userId), eq(chatMessages.conversationId, conversationId)))
        .orderBy(chatMessages.createdAt)
        .limit(100);
    return { conversationId, messages };
}
// Delete a conversation
export async function deleteConversation(userId, conversationId) {
    await db.delete(chatMessages).where(and(eq(chatMessages.userId, userId), eq(chatMessages.conversationId, conversationId)));
    await db.delete(conversations).where(and(eq(conversations.userId, userId), eq(conversations.id, conversationId)));
    return { deleted: true };
}
// ─── Chat History ────────────────────────────────────────────────────────────
export async function getChatHistory(userId) {
    // Get the most recent conversation for this user
    const latestMessage = await db
        .select({ conversationId: chatMessages.conversationId })
        .from(chatMessages)
        .where(eq(chatMessages.userId, userId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
    if (latestMessage.length === 0) {
        return { messages: [], conversationId: null };
    }
    const convId = latestMessage[0].conversationId;
    const messages = await db
        .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        metadata: chatMessages.metadata,
        createdAt: chatMessages.createdAt,
    })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, convId))
        .orderBy(chatMessages.createdAt)
        .limit(50);
    return {
        conversationId: convId,
        messages: messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata,
            createdAt: m.createdAt,
        })),
    };
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
