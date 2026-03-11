export const Colors = {
  // Base backgrounds
  background: '#0F1117',
  cardBase: '#161B22',
  cardElevated: '#1C2333',
  surface: '#12161F',

  // Borders
  border: 'rgba(255, 255, 255, 0.06)',
  borderActive: 'rgba(16, 185, 129, 0.4)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',

  // Brand green
  green: '#10B981',
  greenLight: '#34D399',
  greenDim: 'rgba(16, 185, 129, 0.15)',
  greenGlow: 'rgba(16, 185, 129, 0.08)',
  greenBorder: 'rgba(16, 185, 129, 0.3)',

  // Secondary blue
  blue: '#0D7FF2',
  blueDim: 'rgba(13, 127, 242, 0.15)',
  blueLight: '#38BDF8',

  // State colors
  error: '#EF4444',
  errorDim: 'rgba(239, 68, 68, 0.15)',
  warning: '#F59E0B',
  warningDim: 'rgba(245, 158, 11, 0.15)',
  purple: '#A855F7',
  purpleDim: 'rgba(168, 85, 247, 0.15)',
  pink: '#EC4899',
  cyan: '#22D3EE',
  lime: '#84CC16',
  yellow: '#EAB308',
  orange: '#F97316',

  // Text hierarchy
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textTertiary: 'rgba(255, 255, 255, 0.35)',
  textDisabled: 'rgba(255, 255, 255, 0.2)',

  // Arena chart lines (5 distinct colors)
  arenaLine1: '#39FF14', // Lime green
  arenaLine2: '#A855F7', // Purple
  arenaLine3: '#EC4899', // Pink
  arenaLine4: '#22D3EE', // Cyan
  arenaLine5: '#EAB308', // Yellow

  // Tab bar
  tabActive: '#10B981',
  tabInactive: 'rgba(255, 255, 255, 0.4)',
  tabBackground: '#0A0D14',
  tabBorder: 'rgba(255, 255, 255, 0.06)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',

  // White utils
  white: '#FFFFFF',
  white10: 'rgba(255, 255, 255, 0.1)',
  white20: 'rgba(255, 255, 255, 0.2)',
  white40: 'rgba(255, 255, 255, 0.4)',
  white60: 'rgba(255, 255, 255, 0.6)',
  white80: 'rgba(255, 255, 255, 0.8)',

  // Chart
  chartGradientStart: 'rgba(16, 185, 129, 0.25)',
  chartGradientEnd: 'rgba(16, 185, 129, 0.0)',
  chartLine: '#10B981',

  // Status
  statusLive: '#10B981',
  statusPaper: '#0D7FF2',
  statusPending: '#F59E0B',
  statusInactive: 'rgba(255, 255, 255, 0.3)',
} as const;

export type ColorKey = keyof typeof Colors;
