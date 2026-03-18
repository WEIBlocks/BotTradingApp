import type { ExchangeAdapter } from './base.adapter.js';
import { BinanceAdapter } from './binance.adapter.js';
import { CoinbaseAdapter } from './coinbase.adapter.js';
import { KrakenAdapter } from './kraken.adapter.js';
import { AlpacaAdapter } from './alpaca.adapter.js';

const adapters: Record<string, () => ExchangeAdapter> = {
  binance: () => new BinanceAdapter(),
  coinbase: () => new CoinbaseAdapter(),
  kraken: () => new KrakenAdapter(),
  alpaca: () => new AlpacaAdapter(),
};

export function createAdapter(provider: string): ExchangeAdapter {
  const factory = adapters[provider.toLowerCase()];
  if (!factory) {
    throw new Error(`Unsupported exchange provider: ${provider}`);
  }
  return factory();
}
