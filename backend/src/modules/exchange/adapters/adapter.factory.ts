import type { ExchangeAdapter } from './base.adapter.js';
import { BinanceAdapter } from './binance.adapter.js';

const adapters: Record<string, () => ExchangeAdapter> = {
  binance: () => new BinanceAdapter(),
  // Additional adapters can be registered here
};

export function createAdapter(provider: string): ExchangeAdapter {
  const factory = adapters[provider.toLowerCase()];
  if (!factory) {
    throw new Error(`Unsupported exchange provider: ${provider}`);
  }
  return factory();
}
