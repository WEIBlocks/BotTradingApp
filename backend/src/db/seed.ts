/**
 * Database Seed Script
 *
 * Populates the database with realistic mock data matching the BotTradeApp mobile app.
 * Idempotent: clears all existing data then re-inserts.
 *
 * Usage: npm run db:seed
 */

import { db, queryClient } from "../config/database.js";
import { sql } from "drizzle-orm";
import { hashPassword } from "../lib/password.js";

// Schema imports
import { users, refreshTokens } from "./schema/users.js";
import {
  bots,
  botVersions,
  botStatistics,
  botSubscriptions,
  shadowSessions,
  reviews,
} from "./schema/bots.js";
import { trades } from "./schema/trades.js";
import {
  subscriptionPlans,
  userSubscriptions,
} from "./schema/subscriptions.js";
import { paymentMethods, payments } from "./schema/payments.js";
import {
  notifications,
  notificationSettings,
} from "./schema/notifications.js";
import { arenaSessions, arenaGladiators } from "./schema/arena.js";
import { trainingUploads, activityLog } from "./schema/training.js";
import {
  exchangeConnections,
  exchangeAssets,
} from "./schema/exchanges.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

function randomBetween(min: number, max: number): number {
  return +(min + Math.random() * (max - min)).toFixed(2);
}

function generateMonthlyReturns(): { month: string; return: number }[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return months.map((m) => ({ month: m, return: randomBetween(-8, 18) }));
}

function generateEquityData(days: number): { day: number; value: number }[] {
  let value = 10000;
  const data: { day: number; value: number }[] = [];
  for (let i = 0; i < days; i++) {
    value += randomBetween(-200, 350);
    if (value < 5000) value = 5000;
    data.push({ day: i + 1, value: +value.toFixed(2) });
  }
  return data;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding database...\n");

  // --------------------------------------------------
  // 1. Clear existing data (reverse dependency order)
  // --------------------------------------------------
  console.log("Clearing existing data...");

  await db.delete(arenaGladiators);
  await db.delete(arenaSessions);
  await db.delete(exchangeAssets);
  await db.delete(exchangeConnections);
  await db.delete(trainingUploads);
  await db.delete(activityLog);
  await db.delete(notifications);
  await db.delete(notificationSettings);
  await db.delete(payments);
  await db.delete(paymentMethods);
  await db.delete(userSubscriptions);
  await db.delete(trades);
  await db.delete(shadowSessions);
  await db.delete(botSubscriptions);
  await db.delete(reviews);
  await db.delete(botStatistics);
  await db.delete(botVersions);
  await db.delete(bots);
  await db.delete(subscriptionPlans);
  await db.delete(refreshTokens);
  await db.delete(users);

  console.log("  Cleared all tables.\n");

  // --------------------------------------------------
  // 2. Create users
  // --------------------------------------------------
  console.log("Creating users...");
  const passwordHash = await hashPassword("Password123!");

  const [adminUser] = await db
    .insert(users)
    .values({
      email: "admin@bottrade.com",
      passwordHash,
      name: "Admin User",
      avatarInitials: "AU",
      avatarColor: "#6C5CE7",
      role: "admin",
      riskTolerance: 70,
      investmentGoal: "Aggressive Growth",
      referralCode: "ADMIN2024",
      onboardingComplete: true,
    })
    .returning();

  const [creatorUser] = await db
    .insert(users)
    .values({
      email: "creator@bottrade.com",
      passwordHash,
      name: "Alex Trading",
      avatarInitials: "AT",
      avatarColor: "#00B894",
      role: "creator",
      riskTolerance: 60,
      investmentGoal: "Balanced",
      referralCode: "CREATOR24",
      onboardingComplete: true,
    })
    .returning();

  const [regularUser] = await db
    .insert(users)
    .values({
      email: "user@bottrade.com",
      passwordHash,
      name: "Jordan Smith",
      avatarInitials: "JS",
      avatarColor: "#0984E3",
      role: "user",
      riskTolerance: 50,
      investmentGoal: "Moderate Growth",
      referralCode: "JSMITH24",
      onboardingComplete: true,
    })
    .returning();

  const [user2] = await db
    .insert(users)
    .values({
      email: "sarah@bottrade.com",
      passwordHash,
      name: "Sarah Chen",
      avatarInitials: "SC",
      avatarColor: "#E17055",
      role: "user",
      riskTolerance: 30,
      investmentGoal: "Conservative",
      referralCode: "SCHEN24",
      referredBy: regularUser.id,
      onboardingComplete: true,
    })
    .returning();

  const [creator2] = await db
    .insert(users)
    .values({
      email: "maria@bottrade.com",
      passwordHash,
      name: "Maria DeFi",
      avatarInitials: "MD",
      avatarColor: "#FDCB6E",
      role: "creator",
      riskTolerance: 80,
      investmentGoal: "Aggressive Growth",
      referralCode: "MDEFI24",
      onboardingComplete: true,
    })
    .returning();

  console.log(
    `  Created ${5} users: admin, 2 creators, 2 regular users.\n`
  );

  // --------------------------------------------------
  // 3. Create bots
  // --------------------------------------------------
  console.log("Creating bots...");

  const botDefs = [
    {
      creatorId: creatorUser.id,
      name: "BTC Momentum Pro",
      subtitle: "Ride Bitcoin trends with momentum-based entries",
      description:
        "Advanced momentum strategy that identifies Bitcoin trend continuations using RSI, MACD, and volume analysis. Optimized for 4H timeframe with dynamic stop-losses.",
      strategy: "Momentum",
      category: "Crypto" as const,
      riskLevel: "Med" as const,
      priceMonthly: "29.99",
      tags: ["BTC", "Momentum", "Trend Following"],
      avatarColor: "#F7931A",
      avatarLetter: "BM",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creatorUser.id,
      name: "ETH Scalper",
      subtitle: "High-frequency Ethereum scalping",
      description:
        "Captures small price movements in ETH/USDT using order book analysis and mean reversion on 1m-5m charts. High trade frequency, low risk per trade.",
      strategy: "Scalping",
      category: "Crypto" as const,
      riskLevel: "High" as const,
      priceMonthly: "49.99",
      tags: ["ETH", "Scalping", "High Frequency"],
      avatarColor: "#627EEA",
      avatarLetter: "ES",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creator2.id,
      name: "SOL DeFi Hunter",
      subtitle: "Solana ecosystem opportunities",
      description:
        "Monitors Solana DeFi protocols for arbitrage and yield farming opportunities. Executes trades across Jupiter, Raydium, and Orca DEXs.",
      strategy: "DeFi Arbitrage",
      category: "Crypto" as const,
      riskLevel: "High" as const,
      priceMonthly: "39.99",
      tags: ["SOL", "DeFi", "Arbitrage"],
      avatarColor: "#9945FF",
      avatarLetter: "SD",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creatorUser.id,
      name: "Forex Majors Grid",
      subtitle: "Grid trading on major currency pairs",
      description:
        "Grid-based strategy for EUR/USD, GBP/USD, and USD/JPY. Places buy and sell orders at fixed intervals to profit from ranging markets.",
      strategy: "Grid Trading",
      category: "Forex" as const,
      riskLevel: "Low" as const,
      priceMonthly: "19.99",
      tags: ["Forex", "Grid", "EUR/USD"],
      avatarColor: "#00CEC9",
      avatarLetter: "FG",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creator2.id,
      name: "AI Sentiment Alpha",
      subtitle: "AI-powered news sentiment analysis",
      description:
        "Uses natural language processing to analyze crypto news, social media sentiment, and on-chain data. Generates signals based on sentiment shifts before price action.",
      strategy: "AI Sentiment",
      category: "Multi" as const,
      riskLevel: "Med" as const,
      priceMonthly: "59.99",
      tags: ["AI", "Sentiment", "NLP", "Multi-Asset"],
      avatarColor: "#A29BFE",
      avatarLetter: "AI",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creatorUser.id,
      name: "S&P 500 Swing",
      subtitle: "Swing trading top US stocks",
      description:
        "Identifies swing trading opportunities in S&P 500 stocks using weekly support/resistance levels and RSI divergence patterns.",
      strategy: "Swing Trading",
      category: "Stocks" as const,
      riskLevel: "Low" as const,
      priceMonthly: "24.99",
      tags: ["Stocks", "Swing", "S&P 500"],
      avatarColor: "#55EFC4",
      avatarLetter: "SP",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creator2.id,
      name: "Altcoin Season",
      subtitle: "Rotate into trending altcoins",
      description:
        "Monitors Bitcoin dominance and altcoin relative strength to rotate into high-momentum altcoins during alt seasons. Covers top 50 altcoins by market cap.",
      strategy: "Rotation",
      category: "Crypto" as const,
      riskLevel: "Very High" as const,
      priceMonthly: "34.99",
      tags: ["Altcoins", "Rotation", "High Risk"],
      avatarColor: "#E84393",
      avatarLetter: "AS",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creatorUser.id,
      name: "DCA Smart Bot",
      subtitle: "Intelligent dollar-cost averaging",
      description:
        "Enhances traditional DCA with volatility-adjusted sizing. Buys more when fear is high and less during euphoria. Supports BTC, ETH, and SOL.",
      strategy: "DCA",
      category: "Crypto" as const,
      riskLevel: "Very Low" as const,
      priceMonthly: "0",
      tags: ["DCA", "Low Risk", "Beginner"],
      avatarColor: "#74B9FF",
      avatarLetter: "DC",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creator2.id,
      name: "Gold & Forex Hedge",
      subtitle: "Safe-haven hedging strategy",
      description:
        "Hedges crypto portfolio volatility by monitoring gold/USD correlation and shifting allocation to XAU/USD and stable forex pairs during high-risk periods.",
      strategy: "Hedging",
      category: "Multi" as const,
      riskLevel: "Low" as const,
      priceMonthly: "29.99",
      tags: ["Gold", "Forex", "Hedging", "Safe Haven"],
      avatarColor: "#FFD700",
      avatarLetter: "GH",
      status: "approved" as const,
      isPublished: true,
    },
    {
      creatorId: creatorUser.id,
      name: "Breakout Sniper",
      subtitle: "Catches breakout moves before the crowd",
      description:
        "Monitors consolidation patterns on BTC, ETH, and SOL. Enters breakout trades with tight stop-losses when volume confirms the move. 1H timeframe.",
      strategy: "Breakout",
      category: "Crypto" as const,
      riskLevel: "Med" as const,
      priceMonthly: "34.99",
      tags: ["Breakout", "BTC", "ETH", "SOL"],
      avatarColor: "#FF6B6B",
      avatarLetter: "BS",
      status: "approved" as const,
      isPublished: true,
    },
  ];

  const insertedBots = await db.insert(bots).values(botDefs).returning();
  console.log(`  Created ${insertedBots.length} bots.\n`);

  // --------------------------------------------------
  // 4. Create bot statistics
  // --------------------------------------------------
  console.log("Creating bot statistics...");

  const statsDefs = insertedBots.map((bot) => ({
    botId: bot.id,
    return30d: randomBetween(-5, 25).toString(),
    winRate: randomBetween(48, 78).toString(),
    maxDrawdown: randomBetween(3, 18).toString(),
    sharpeRatio: randomBetween(0.5, 3.2).toString(),
    activeUsers: Math.floor(randomBetween(50, 2500)),
    reviewCount: Math.floor(randomBetween(10, 500)),
    avgRating: randomBetween(3.5, 4.9).toString(),
    monthlyReturns: generateMonthlyReturns(),
    equityData: generateEquityData(30),
  }));

  await db.insert(botStatistics).values(statsDefs);
  console.log(`  Created ${statsDefs.length} bot statistics entries.\n`);

  // --------------------------------------------------
  // 5. Create bot versions
  // --------------------------------------------------
  console.log("Creating bot versions...");

  const versionDefs = insertedBots.map((bot) => ({
    botId: bot.id,
    version: "1.0.0",
    configSnapshot: { strategy: bot.strategy, timeframe: "4H" },
    isActive: true,
  }));

  const insertedVersions = await db
    .insert(botVersions)
    .values(versionDefs)
    .returning();
  console.log(`  Created ${insertedVersions.length} bot versions.\n`);

  // --------------------------------------------------
  // 6. Create bot subscriptions
  // --------------------------------------------------
  console.log("Creating bot subscriptions...");

  const subDefs = [
    // Regular user subscribed to 3 bots
    {
      userId: regularUser.id,
      botId: insertedBots[0].id, // BTC Momentum Pro
      botVersionId: insertedVersions[0].id,
      status: "active" as const,
      mode: "live" as const,
      allocatedAmount: "5000.00",
      pair: "BTC/USDT",
      startedAt: daysAgo(45),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
    {
      userId: regularUser.id,
      botId: insertedBots[1].id, // ETH Scalper
      botVersionId: insertedVersions[1].id,
      status: "active" as const,
      mode: "paper" as const,
      allocatedAmount: "2000.00",
      pair: "ETH/USDT",
      startedAt: daysAgo(20),
      expiresAt: new Date(Date.now() + 40 * 86400000),
    },
    {
      userId: regularUser.id,
      botId: insertedBots[7].id, // DCA Smart Bot (free)
      botVersionId: insertedVersions[7].id,
      status: "active" as const,
      mode: "live" as const,
      allocatedAmount: "1000.00",
      pair: "BTC/USDT",
      startedAt: daysAgo(60),
    },
    // user2 subscribed to 2 bots
    {
      userId: user2.id,
      botId: insertedBots[4].id, // AI Sentiment Alpha
      botVersionId: insertedVersions[4].id,
      status: "active" as const,
      mode: "paper" as const,
      allocatedAmount: "3000.00",
      pair: "BTC/USDT",
      startedAt: daysAgo(10),
      expiresAt: new Date(Date.now() + 50 * 86400000),
    },
    {
      userId: user2.id,
      botId: insertedBots[5].id, // S&P 500 Swing
      botVersionId: insertedVersions[5].id,
      status: "paused" as const,
      mode: "live" as const,
      allocatedAmount: "8000.00",
      pair: "SPY/USD",
      startedAt: daysAgo(30),
    },
  ];

  const insertedSubs = await db
    .insert(botSubscriptions)
    .values(subDefs)
    .returning();
  console.log(`  Created ${insertedSubs.length} bot subscriptions.\n`);

  // --------------------------------------------------
  // 7. Create trades history
  // --------------------------------------------------
  console.log("Creating trades...");

  const tradePairs = [
    { symbol: "BTC/USDT", priceRange: [58000, 72000] },
    { symbol: "ETH/USDT", priceRange: [2800, 4200] },
    { symbol: "SOL/USDT", priceRange: [120, 220] },
    { symbol: "BNB/USDT", priceRange: [520, 680] },
    { symbol: "XRP/USDT", priceRange: [0.45, 0.75] },
  ];

  const tradeDefs: Array<{
    userId: string;
    botSubscriptionId: string;
    symbol: string;
    side: "BUY" | "SELL";
    amount: string;
    price: string;
    totalValue: string;
    pnl: string;
    pnlPercent: string;
    isPaper: boolean;
    reasoning: string;
    status: "filled";
    executedAt: Date;
  }> = [];

  // Generate 30 trades for the regular user
  for (let i = 0; i < 30; i++) {
    const pair = tradePairs[i % tradePairs.length];
    const price = randomBetween(pair.priceRange[0], pair.priceRange[1]);
    const amount = +(randomBetween(0.001, 0.5)).toFixed(8);
    const total = +(price * amount).toFixed(2);
    const side: "BUY" | "SELL" = i % 3 === 0 ? "SELL" : "BUY";
    const pnl = side === "SELL" ? randomBetween(-200, 500) : 0;
    const pnlPct = pnl !== 0 ? randomBetween(-5, 12) : 0;

    tradeDefs.push({
      userId: regularUser.id,
      botSubscriptionId: insertedSubs[0].id,
      symbol: pair.symbol,
      side,
      amount: amount.toString(),
      price: price.toString(),
      totalValue: total.toString(),
      pnl: pnl.toString(),
      pnlPercent: pnlPct.toString(),
      isPaper: false,
      reasoning:
        side === "BUY"
          ? "RSI oversold, MACD bullish crossover detected"
          : "Take profit target reached, trailing stop triggered",
      status: "filled" as const,
      executedAt: hoursAgo(i * 8 + Math.floor(Math.random() * 4)),
    });
  }

  // Generate 15 paper trades for user2
  for (let i = 0; i < 15; i++) {
    const pair = tradePairs[i % tradePairs.length];
    const price = randomBetween(pair.priceRange[0], pair.priceRange[1]);
    const amount = +(randomBetween(0.01, 1.0)).toFixed(8);
    const total = +(price * amount).toFixed(2);
    const side: "BUY" | "SELL" = i % 2 === 0 ? "BUY" : "SELL";
    const pnl = side === "SELL" ? randomBetween(-100, 300) : 0;
    const pnlPct = pnl !== 0 ? randomBetween(-3, 8) : 0;

    tradeDefs.push({
      userId: user2.id,
      botSubscriptionId: insertedSubs[3].id,
      symbol: pair.symbol,
      side,
      amount: amount.toString(),
      price: price.toString(),
      totalValue: total.toString(),
      pnl: pnl.toString(),
      pnlPercent: pnlPct.toString(),
      isPaper: true,
      reasoning: "AI sentiment score shifted above 0.7, momentum confirmed",
      status: "filled" as const,
      executedAt: hoursAgo(i * 12 + Math.floor(Math.random() * 6)),
    });
  }

  await db.insert(trades).values(tradeDefs);
  console.log(`  Created ${tradeDefs.length} trades.\n`);

  // --------------------------------------------------
  // 8. Create subscription plans
  // --------------------------------------------------
  console.log("Creating subscription plans...");

  const planDefs = [
    {
      name: "Free",
      tier: "free" as const,
      price: "0.00",
      period: "monthly" as const,
      features: [
        "1 active bot",
        "Paper trading only",
        "Basic analytics",
        "Community support",
      ],
      discountPercent: "0",
    },
    {
      name: "Pro Monthly",
      tier: "pro" as const,
      price: "29.99",
      period: "monthly" as const,
      googleProductId: "bottrade_pro_monthly",
      appleProductId: "com.botttradeapp.pro.monthly",
      features: [
        "Unlimited bots",
        "Live & paper trading",
        "Advanced analytics",
        "Priority support",
        "Arena access",
        "AI chat assistant",
      ],
      discountPercent: "0",
    },
    {
      name: "Pro Yearly",
      tier: "pro" as const,
      price: "249.99",
      period: "yearly" as const,
      googleProductId: "bottrade_pro_yearly",
      appleProductId: "com.botttradeapp.pro.yearly",
      features: [
        "Unlimited bots",
        "Live & paper trading",
        "Advanced analytics",
        "Priority support",
        "Arena access",
        "AI chat assistant",
        "Custom bot builder",
        "Early feature access",
      ],
      discountPercent: "30",
    },
  ];

  const insertedPlans = await db
    .insert(subscriptionPlans)
    .values(planDefs)
    .returning();
  console.log(`  Created ${insertedPlans.length} subscription plans.\n`);

  // --------------------------------------------------
  // 9. Create user subscriptions (to plans)
  // --------------------------------------------------
  console.log("Creating user subscriptions...");

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 86400000);
  const yearLater = new Date(now.getTime() + 365 * 86400000);

  const userSubDefs = [
    {
      userId: regularUser.id,
      planId: insertedPlans[1].id, // Pro Monthly
      status: "active" as const,
      currentPeriodStart: daysAgo(15),
      currentPeriodEnd: thirtyDaysLater,
    },
    {
      userId: user2.id,
      planId: insertedPlans[0].id, // Free
      status: "active" as const,
      currentPeriodStart: daysAgo(30),
      currentPeriodEnd: thirtyDaysLater,
    },
    {
      userId: creatorUser.id,
      planId: insertedPlans[2].id, // Pro Yearly
      status: "active" as const,
      currentPeriodStart: daysAgo(60),
      currentPeriodEnd: yearLater,
    },
  ];

  await db.insert(userSubscriptions).values(userSubDefs);
  console.log(`  Created ${userSubDefs.length} user subscriptions.\n`);

  // --------------------------------------------------
  // 10. Create notifications
  // --------------------------------------------------
  console.log("Creating notifications...");

  const notifDefs = [
    {
      userId: regularUser.id,
      type: "trade" as const,
      title: "BTC/USDT Buy Executed",
      body: "BTC Momentum Pro bought 0.025 BTC at $67,432.50. Reason: RSI oversold bounce detected.",
      priority: "normal" as const,
      read: false,
      createdAt: hoursAgo(1),
    },
    {
      userId: regularUser.id,
      type: "trade" as const,
      title: "ETH/USDT Sell Executed",
      body: "ETH Scalper sold 0.5 ETH at $3,421.80. PnL: +$42.30 (+1.25%)",
      priority: "normal" as const,
      read: false,
      createdAt: hoursAgo(3),
    },
    {
      userId: regularUser.id,
      type: "alert" as const,
      title: "Risk Alert: High Volatility",
      body: "BTC volatility index exceeded threshold. BTC Momentum Pro has tightened stop-losses automatically.",
      priority: "high" as const,
      read: false,
      createdAt: hoursAgo(6),
    },
    {
      userId: regularUser.id,
      type: "system" as const,
      title: "Welcome to BotTrade!",
      body: "Your account is set up. Start by exploring the Marketplace to find your first trading bot.",
      priority: "low" as const,
      read: true,
      createdAt: daysAgo(45),
    },
    {
      userId: regularUser.id,
      type: "system" as const,
      title: "Pro Monthly Plan Activated",
      body: "Your Pro Monthly subscription is now active. Enjoy unlimited bots and live trading!",
      priority: "normal" as const,
      read: true,
      createdAt: daysAgo(15),
    },
    {
      userId: regularUser.id,
      type: "trade" as const,
      title: "SOL/USDT Buy Executed",
      body: "DCA Smart Bot purchased 2.5 SOL at $168.40. Weekly DCA order completed.",
      priority: "normal" as const,
      read: true,
      createdAt: daysAgo(2),
    },
    {
      userId: user2.id,
      type: "system" as const,
      title: "Welcome to BotTrade!",
      body: "Your account is set up. Explore paper trading to get started risk-free.",
      priority: "low" as const,
      read: true,
      createdAt: daysAgo(10),
    },
    {
      userId: user2.id,
      type: "trade" as const,
      title: "Paper Trade: BTC/USDT Buy",
      body: "AI Sentiment Alpha (paper) bought 0.1 BTC at $65,200. Sentiment score: 0.82",
      priority: "normal" as const,
      read: false,
      createdAt: hoursAgo(5),
    },
    {
      userId: creatorUser.id,
      type: "system" as const,
      title: "New Subscriber!",
      body: "Jordan Smith subscribed to BTC Momentum Pro. You now have 1,247 active subscribers.",
      priority: "normal" as const,
      read: false,
      createdAt: daysAgo(1),
    },
    {
      userId: creatorUser.id,
      type: "system" as const,
      title: "Monthly Revenue Report",
      body: "Your bots earned $8,430.00 in subscription revenue this month. Top performer: ETH Scalper.",
      priority: "low" as const,
      read: true,
      createdAt: daysAgo(5),
    },
  ];

  await db.insert(notifications).values(notifDefs);
  console.log(`  Created ${notifDefs.length} notifications.\n`);

  // --------------------------------------------------
  // 11. Create notification settings
  // --------------------------------------------------
  console.log("Creating notification settings...");

  const notifSettingsDefs = [
    {
      userId: regularUser.id,
      tradeAlerts: true,
      systemUpdates: true,
      priceAlerts: true,
      pushEnabled: true,
      emailEnabled: false,
    },
    {
      userId: user2.id,
      tradeAlerts: true,
      systemUpdates: true,
      priceAlerts: false,
      pushEnabled: true,
      emailEnabled: true,
    },
    {
      userId: creatorUser.id,
      tradeAlerts: true,
      systemUpdates: true,
      priceAlerts: true,
      pushEnabled: true,
      emailEnabled: true,
    },
  ];

  await db.insert(notificationSettings).values(notifSettingsDefs);
  console.log(`  Created ${notifSettingsDefs.length} notification settings.\n`);

  // --------------------------------------------------
  // 12. Create activity log entries
  // --------------------------------------------------
  console.log("Creating activity log entries...");

  const activityDefs = [
    {
      userId: regularUser.id,
      type: "purchase" as const,
      title: "Bot Subscription",
      subtitle: "BTC Momentum Pro - Monthly",
      amount: "29.99",
      createdAt: daysAgo(45),
    },
    {
      userId: regularUser.id,
      type: "deposit" as const,
      title: "Deposit",
      subtitle: "From Binance wallet",
      amount: "5000.00",
      createdAt: daysAgo(44),
    },
    {
      userId: regularUser.id,
      type: "profit" as const,
      title: "Trading Profit",
      subtitle: "BTC Momentum Pro - Weekly P&L",
      amount: "342.50",
      createdAt: daysAgo(7),
    },
    {
      userId: regularUser.id,
      type: "purchase" as const,
      title: "Bot Subscription",
      subtitle: "ETH Scalper - Monthly",
      amount: "49.99",
      createdAt: daysAgo(20),
    },
    {
      userId: regularUser.id,
      type: "fee" as const,
      title: "Trading Fee",
      subtitle: "BTC/USDT trade commission",
      amount: "2.45",
      createdAt: daysAgo(3),
    },
    {
      userId: regularUser.id,
      type: "profit" as const,
      title: "Trading Profit",
      subtitle: "ETH Scalper - Daily P&L",
      amount: "87.20",
      createdAt: daysAgo(1),
    },
    {
      userId: regularUser.id,
      type: "withdrawal" as const,
      title: "Withdrawal",
      subtitle: "To external wallet",
      amount: "500.00",
      createdAt: daysAgo(14),
    },
    {
      userId: user2.id,
      type: "deposit" as const,
      title: "Deposit",
      subtitle: "Initial paper trading balance",
      amount: "10000.00",
      createdAt: daysAgo(10),
    },
    {
      userId: user2.id,
      type: "profit" as const,
      title: "Paper Trading Profit",
      subtitle: "AI Sentiment Alpha - Weekly P&L",
      amount: "215.80",
      createdAt: daysAgo(3),
    },
    {
      userId: creatorUser.id,
      type: "profit" as const,
      title: "Creator Revenue",
      subtitle: "March subscriber revenue payout",
      amount: "8430.00",
      createdAt: daysAgo(5),
    },
  ];

  await db.insert(activityLog).values(activityDefs);
  console.log(`  Created ${activityDefs.length} activity log entries.\n`);

  // --------------------------------------------------
  // 13. Create reviews
  // --------------------------------------------------
  console.log("Creating reviews...");

  const reviewDefs = [
    {
      userId: regularUser.id,
      botId: insertedBots[0].id,
      rating: 5,
      text: "BTC Momentum Pro has been incredibly consistent. Made 18% in my first month. Stop-losses saved me during the flash crash.",
      createdAt: daysAgo(10),
    },
    {
      userId: regularUser.id,
      botId: insertedBots[1].id,
      rating: 4,
      text: "ETH Scalper executes a lot of trades but the win rate is solid. Wish it supported more pairs.",
      createdAt: daysAgo(5),
    },
    {
      userId: user2.id,
      botId: insertedBots[4].id,
      rating: 4,
      text: "The AI sentiment analysis is surprisingly accurate. Caught the recent pump before most indicators.",
      createdAt: daysAgo(3),
    },
    {
      userId: user2.id,
      botId: insertedBots[7].id,
      rating: 5,
      text: "Perfect for beginners. Free, simple, and effective. The volatility-adjusted sizing is a great touch.",
      createdAt: daysAgo(8),
    },
  ];

  await db.insert(reviews).values(reviewDefs);
  console.log(`  Created ${reviewDefs.length} reviews.\n`);

  // --------------------------------------------------
  // 14. Create exchange connections
  // --------------------------------------------------
  console.log("Creating exchange connections...");

  const [binanceConn] = await db
    .insert(exchangeConnections)
    .values({
      userId: regularUser.id,
      provider: "Binance",
      method: "api_key",
      apiKeyEnc: "encrypted_placeholder_key",
      apiSecretEnc: "encrypted_placeholder_secret",
      status: "connected",
      accountLabel: "Main Trading Account",
      totalBalance: "12450.00",
      lastSyncAt: hoursAgo(1),
    })
    .returning();

  const [coinbaseConn] = await db
    .insert(exchangeConnections)
    .values({
      userId: regularUser.id,
      provider: "Coinbase",
      method: "oauth",
      oauthTokenEnc: "encrypted_oauth_token",
      oauthRefreshEnc: "encrypted_refresh_token",
      status: "connected",
      accountLabel: "Coinbase Portfolio",
      totalBalance: "8200.00",
      lastSyncAt: hoursAgo(2),
    })
    .returning();

  console.log("  Created 2 exchange connections.\n");

  // --------------------------------------------------
  // 15. Create exchange assets
  // --------------------------------------------------
  console.log("Creating exchange assets...");

  const assetDefs = [
    {
      exchangeConnId: binanceConn.id,
      symbol: "BTC",
      name: "Bitcoin",
      amount: "0.15200000",
      valueUsd: "9880.00",
      change24h: "2.35",
      allocation: "45.20",
      iconColor: "#F7931A",
    },
    {
      exchangeConnId: binanceConn.id,
      symbol: "ETH",
      name: "Ethereum",
      amount: "1.85000000",
      valueUsd: "6290.00",
      change24h: "-1.20",
      allocation: "28.70",
      iconColor: "#627EEA",
    },
    {
      exchangeConnId: binanceConn.id,
      symbol: "SOL",
      name: "Solana",
      amount: "12.50000000",
      valueUsd: "2100.00",
      change24h: "5.80",
      allocation: "9.60",
      iconColor: "#9945FF",
    },
    {
      exchangeConnId: binanceConn.id,
      symbol: "USDT",
      name: "Tether",
      amount: "3620.00000000",
      valueUsd: "3620.00",
      change24h: "0.01",
      allocation: "16.50",
      iconColor: "#26A17B",
    },
    {
      exchangeConnId: coinbaseConn.id,
      symbol: "BTC",
      name: "Bitcoin",
      amount: "0.08000000",
      valueUsd: "5200.00",
      change24h: "2.35",
      allocation: "63.40",
      iconColor: "#F7931A",
    },
    {
      exchangeConnId: coinbaseConn.id,
      symbol: "ETH",
      name: "Ethereum",
      amount: "0.90000000",
      valueUsd: "3060.00",
      change24h: "-1.20",
      allocation: "37.30",
      iconColor: "#627EEA",
    },
  ];

  await db.insert(exchangeAssets).values(assetDefs);
  console.log(`  Created ${assetDefs.length} exchange assets.\n`);

  // --------------------------------------------------
  // 16. Create payment methods & payments
  // --------------------------------------------------
  console.log("Creating payment methods and payments...");

  const [cardPm] = await db
    .insert(paymentMethods)
    .values({
      userId: regularUser.id,
      type: "card",
      label: "Visa ending 4242",
      last4: "4242",
      network: "Visa",
      isDefault: true,
    })
    .returning();

  await db.insert(paymentMethods).values({
    userId: regularUser.id,
    type: "crypto",
    label: "BTC Wallet",
    cryptoAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    isDefault: false,
  });

  const paymentDefs = [
    {
      userId: regularUser.id,
      type: "bot_purchase" as const,
      amount: "29.99",
      currency: "USD",
      status: "succeeded" as const,
      metadata: { botName: "BTC Momentum Pro", planType: "monthly" },
      createdAt: daysAgo(45),
    },
    {
      userId: regularUser.id,
      type: "bot_purchase" as const,
      amount: "49.99",
      currency: "USD",
      status: "succeeded" as const,
      metadata: { botName: "ETH Scalper", planType: "monthly" },
      createdAt: daysAgo(20),
    },
    {
      userId: regularUser.id,
      type: "subscription" as const,
      amount: "29.99",
      currency: "USD",
      status: "succeeded" as const,
      metadata: { planName: "Pro Monthly" },
      createdAt: daysAgo(15),
    },
    {
      userId: regularUser.id,
      type: "deposit" as const,
      amount: "5000.00",
      currency: "USD",
      status: "succeeded" as const,
      metadata: { source: "Binance" },
      createdAt: daysAgo(44),
    },
    {
      userId: regularUser.id,
      type: "withdrawal" as const,
      amount: "500.00",
      currency: "USD",
      status: "succeeded" as const,
      metadata: { destination: "External wallet" },
      createdAt: daysAgo(14),
    },
  ];

  await db.insert(payments).values(paymentDefs);
  console.log(
    `  Created 2 payment methods and ${paymentDefs.length} payments.\n`
  );

  // --------------------------------------------------
  // 17. Create shadow session
  // --------------------------------------------------
  console.log("Creating shadow sessions...");

  await db.insert(shadowSessions).values({
    userId: regularUser.id,
    botId: insertedBots[2].id, // SOL DeFi Hunter
    virtualBalance: "10000.00",
    currentBalance: "10842.50",
    durationDays: 14,
    startedAt: daysAgo(10),
    endsAt: new Date(Date.now() + 4 * 86400000),
    status: "running",
    enableRiskLimits: true,
    enableRealisticFees: true,
    dailyPerformance: Array.from({ length: 10 }, (_, i) => ({
      day: i + 1,
      balance: +(10000 + randomBetween(-100, 200) * (i + 1)).toFixed(2),
      trades: Math.floor(randomBetween(2, 8)),
    })),
    totalTrades: 45,
    winCount: 28,
  });

  console.log("  Created 1 shadow session.\n");

  // --------------------------------------------------
  // 18. Create arena session
  // --------------------------------------------------
  console.log("Creating arena sessions...");

  const [arenaSession] = await db
    .insert(arenaSessions)
    .values({
      userId: regularUser.id,
      status: "completed",
      durationSeconds: 180,
      startedAt: daysAgo(2),
      endedAt: new Date(daysAgo(2).getTime() + 180000),
    })
    .returning();

  const gladiatorDefs = [
    {
      sessionId: arenaSession.id,
      botId: insertedBots[0].id, // BTC Momentum Pro
      rank: 1,
      finalReturn: "4.2500",
      winRate: "68.00",
      equityData: generateEquityData(6),
      isWinner: true,
    },
    {
      sessionId: arenaSession.id,
      botId: insertedBots[1].id, // ETH Scalper
      rank: 2,
      finalReturn: "3.1200",
      winRate: "72.00",
      equityData: generateEquityData(6),
      isWinner: false,
    },
    {
      sessionId: arenaSession.id,
      botId: insertedBots[4].id, // AI Sentiment Alpha
      rank: 3,
      finalReturn: "1.8800",
      winRate: "55.00",
      equityData: generateEquityData(6),
      isWinner: false,
    },
  ];

  await db.insert(arenaGladiators).values(gladiatorDefs);
  console.log(
    `  Created 1 arena session with ${gladiatorDefs.length} gladiators.\n`
  );

  // --------------------------------------------------
  // Summary
  // --------------------------------------------------
  console.log("=".repeat(50));
  console.log("Seed complete! Summary:");
  console.log("=".repeat(50));
  console.log(`  Users:                5`);
  console.log(`  Bots:                 ${insertedBots.length}`);
  console.log(`  Bot Statistics:       ${statsDefs.length}`);
  console.log(`  Bot Versions:         ${insertedVersions.length}`);
  console.log(`  Bot Subscriptions:    ${insertedSubs.length}`);
  console.log(`  Trades:               ${tradeDefs.length}`);
  console.log(`  Subscription Plans:   ${insertedPlans.length}`);
  console.log(`  User Subscriptions:   ${userSubDefs.length}`);
  console.log(`  Notifications:        ${notifDefs.length}`);
  console.log(`  Notification Settings:${notifSettingsDefs.length}`);
  console.log(`  Activity Log:         ${activityDefs.length}`);
  console.log(`  Reviews:              ${reviewDefs.length}`);
  console.log(`  Exchange Connections:  2`);
  console.log(`  Exchange Assets:      ${assetDefs.length}`);
  console.log(`  Payment Methods:      2`);
  console.log(`  Payments:             ${paymentDefs.length}`);
  console.log(`  Shadow Sessions:      1`);
  console.log(`  Arena Sessions:       1`);
  console.log(`  Arena Gladiators:     ${gladiatorDefs.length}`);
  console.log("=".repeat(50));

  // Clean exit
  await queryClient.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
