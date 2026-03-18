import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {BottomTabScreenProps} from '@react-navigation/bottom-tabs';

// ============ Navigation Param Lists ============

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  CreateAccount: undefined;
  InvestorQuiz: undefined;
  ConnectCapital: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Market: undefined;
  AIChat: undefined;
  Portfolio: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  AllBots: {initialCategory?: string; initialSort?: string} | undefined;
  BotDetails: {botId: string};
  BotPurchase: {botId: string};
  ShadowMode: undefined;
  ShadowModeResults: {botId: string; profit: number; winRate: number; sessionId?: string};
  ArenaSetup: undefined;
  ArenaLive: {gladiatorIds: string[]; sessionId?: string; durationSeconds?: number};
  ArenaResults: {winnerId: string; sessionId?: string};
  ArenaHistory: undefined;
  Notifications: undefined;
  TradeHistory: undefined;
  WalletFunds: undefined;
  Referral: undefined;
  PaperTradingSetup: undefined;
  NotificationSettings: undefined;
  QuickActions: undefined;
  VoiceAssistant: undefined;
  ExchangeConnect: undefined;
  ExchangeManage: undefined;
  Subscription: undefined;
  PaymentMethod: undefined;
  Checkout: {type: 'bot' | 'subscription'; itemId: string; amount: number};
  CreatorStudio: undefined;
  BotBuilder: {fromChat?: boolean; strategyName?: string; editBotId?: string};
  LiveTrades: undefined;
  TrainingUpload: {botId?: string} | undefined;
  TradingRoom: undefined;
  Settings: undefined;
  HelpSupport: undefined;
};

// ============ Screen Props ============

export type AuthScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type MainTabProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

// ============ Data Models ============

export type RiskLevel = 'Very Low' | 'Low' | 'Med' | 'High' | 'Very High';
export type BotStatus = 'live' | 'paper' | 'paused' | 'inactive';
export type TradeSide = 'BUY' | 'SELL';
export type NotificationType = 'trade' | 'system' | 'alert';
export type ActivityType = 'purchase' | 'withdrawal' | 'profit' | 'deposit' | 'fee';

export interface Bot {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  strategy: string;
  creatorId?: string;
  creatorName: string;
  avatarColor: string;
  avatarLetter: string;
  returnPercent: number; // 30D return
  returnValue?: number;
  winRate: number; // 0-100
  maxDrawdown: number; // negative percent
  sharpeRatio: number;
  risk: RiskLevel;
  price: number; // monthly USD, 0 = free
  status: BotStatus;
  tags: string[]; // Bot DNA badges
  activeUsers: number;
  reviewCount: number;
  rating: number; // 0-5
  monthlyReturns: MonthlyReturn[];
  recentTrades: Trade[];
  equityData: number[];
  reviews: Review[];
  category: 'Crypto' | 'Stocks' | 'Forex' | 'Multi';
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  amount: number;
  price: number;
  timestamp: Date;
  botId: string;
  botName: string;
  pnl?: number;
  pnlPercent?: number;
}

export interface MonthlyReturn {
  month: string; // "Jan", "Feb", etc.
  percent: number;
}

export interface Review {
  id: string;
  userName: string;
  userInitials: string;
  rating: number;
  text: string;
  date: string;
}

export interface Gladiator {
  id: string;
  name: string;
  strategy: string;
  statLabel?: string;
  winRate: number;
  level: number;
  avatarColor: string;
  selected: boolean;
  currentReturn?: number;
  equityData?: number[];
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: Date;
  read: boolean;
  priority?: 'low' | 'normal' | 'high';
  tradeData?: Trade;
  chartData?: number[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  avatarColor: string;
  riskTolerance: number; // 0-100
  investmentGoal: string;
  connectedBrokerage?: string;
  referralCode: string;
  totalBalance: number;
  accountBalance: number;
  buyingPower: number;
  totalProfit: number;
  totalProfitPercent: number;
  activeBots: ActiveBot[];
  recentActivity: Activity[];
}

export interface ActiveBot {
  id: string;
  name: string;
  pair: string;
  avatarColor: string;
  avatarLetter: string;
  dailyReturn: number;
  totalReturn: number;
  status: BotStatus;
  allocatedAmount: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  amount: number;
  timestamp: Date;
}

export interface QuizAnswer {
  step: number;
  selectedOption: number;
  riskTolerance: number;
  investmentGoal: string;
}

export interface ShadowBotResult {
  botId: string;
  botName: string;
  totalProfit: number;
  winRate: number;
  totalTrades: number;
  daysRun: number;
  dailyPerformance: number[]; // array of daily returns
}

export interface ArenaResult {
  gladiatorId: string;
  rank: number;
  finalReturn: number;
  winRate: number;
  equityData: number[];
}

// ============ Exchange & Portfolio ============

export type ExchangeProvider = 'Coinbase' | 'Binance' | 'Kraken' | 'Alpaca' | 'Interactive Brokers';
export type ConnectionMethod = 'oauth' | 'api_key';
export type ConnectionStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface ExchangeConnection {
  id: string;
  provider: ExchangeProvider;
  method: ConnectionMethod;
  status: ConnectionStatus;
  lastSync: string;
  accountLabel: string;
  totalBalance: number;
}

export interface ExchangeAsset {
  symbol: string;
  name: string;
  amount: number;
  valueUsd: number;
  change24h: number;
  allocation: number;
  iconColor: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalChange24h: number;
  totalChangePercent24h: number;
  assets: ExchangeAsset[];
  allocationBreakdown: AllocationItem[];
}

export interface AllocationItem {
  label: string;
  percent: number;
  color: string;
}

// ============ Subscription & Payment ============

export type SubscriptionTier = 'free' | 'pro';
export type PaymentMethodType = 'card' | 'crypto';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  period: 'monthly' | 'yearly';
  features: string[];
  discount?: number;
}

export interface PaymentMethodData {
  id: string;
  type: PaymentMethodType;
  label: string;
  last4?: string;
  network?: string;
  isDefault: boolean;
}

// ============ Creator Studio ============

export interface CreatorStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalUsers: number;
  avgRating: number;
  reviewCount: number;
  churnRate: number;
}

export interface BotVersion {
  id: string;
  version: string;
  isActive: boolean;
  users: number;
  returnPercent: number;
  createdAt: string;
}

// ============ Bot Builder & Training ============

export interface BotConfig {
  name: string;
  pairs: string[];
  strategy: string;
  riskLevel: RiskLevel;
  stopLoss: number;
  takeProfit: number;
  maxPositionSize: number;
  isLive: boolean;
}

export interface TrainingUploadItem {
  id: string;
  type: 'image' | 'video' | 'document';
  name: string;
  status: 'processing' | 'complete' | 'error';
  uploadedAt: string;
}

// ============ Live Trades ============

export interface LiveTrade extends Trade {
  isLive: boolean;
  isOwned?: boolean;
  reasoning?: string;
}
