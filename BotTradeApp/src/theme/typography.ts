import {TextStyle} from 'react-native';

export const FontFamily = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

type TextStyleRecord = Record<string, TextStyle>;

export const Typography: TextStyleRecord = {
  // Display styles
  displayXL: {
    fontFamily: FontFamily.bold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -1,
    color: '#FFFFFF',
  },
  displayLarge: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  displayMedium: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },

  // Heading styles
  headingXL: {
    fontFamily: FontFamily.semiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },
  headingLarge: {
    fontFamily: FontFamily.semiBold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
    color: '#FFFFFF',
  },
  headingMedium: {
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    lineHeight: 26,
    color: '#FFFFFF',
  },
  headingSmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    lineHeight: 22,
    color: '#FFFFFF',
  },

  // Body styles
  bodyXL: {
    fontFamily: FontFamily.regular,
    fontSize: 18,
    lineHeight: 28,
    color: 'rgba(255,255,255,0.7)',
  },
  bodyLarge: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.6)',
  },
  bodyMedium: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.6)',
  },
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.4)',
  },

  // Label styles (medium weight)
  labelLarge: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  labelMedium: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  labelSmall: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.6)',
  },

  // Money/number styles (tabular nums)
  moneyXL: {
    fontFamily: FontFamily.bold,
    fontSize: 42,
    lineHeight: 52,
    letterSpacing: -1.5,
    color: '#FFFFFF',
  },
  moneyLarge: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1,
    color: '#FFFFFF',
  },
  moneyMedium: {
    fontFamily: FontFamily.semiBold,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  moneySmall: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: '#FFFFFF',
  },

  // Caption / Label uppercase
  caption: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  captionBold: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },

  // Button text
  buttonLarge: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  buttonMedium: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
};
