import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Trade} from '../../types';

interface TradeRowProps {
  trade: Trade;
}

const MODE_CONFIG: Record<string, {label: string; color: string; bg: string}> = {
  live: {label: 'LIVE', color: '#10B981', bg: 'rgba(16,185,129,0.1)'},
  shadow: {label: 'SHADOW', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'},
  paper: {label: 'PAPER', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)'},
  arena: {label: 'ARENA', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)'},
};

function formatTradeTime(dateInput: Date | string | any): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!date || isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = (now - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

export default function TradeRow({trade}: TradeRowProps) {
  const isBuy = trade.side === 'BUY';
  const pnlColor = (trade.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444';
  const pnlSign = (trade.pnl ?? 0) >= 0 ? '+' : '';
  const modeKey = trade.mode ?? 'live';
  const modeInfo = MODE_CONFIG[modeKey] ?? MODE_CONFIG.live;
  const tradeValue = trade.amount > 0 ? trade.amount * trade.price : trade.price;
  const timeStr = formatTradeTime(trade.timestamp);

  return (
    <View style={styles.container}>
      <View style={[styles.sideBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
        <Text style={[styles.sideText, isBuy ? styles.buyText : styles.sellText]}>
          {trade.side}
        </Text>
      </View>
      <View style={styles.info}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{trade.symbol}</Text>
          <View style={[styles.modeBadge, {backgroundColor: modeInfo.bg}]}>
            <Text style={[styles.modeText, {color: modeInfo.color}]}>{modeInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.botName}>
          {trade.botName}{timeStr ? ` · ${timeStr}` : ''}
        </Text>
      </View>
      <View style={styles.right}>
        {trade.pnl !== undefined && trade.pnl !== 0 ? (
          <Text style={[styles.pnl, {color: pnlColor}]}>
            {pnlSign}${Math.abs(trade.pnl).toFixed(2)}
          </Text>
        ) : (
          <Text style={styles.price}>
            ${tradeValue > 0 ? tradeValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : trade.price.toLocaleString()}
          </Text>
        )}
        {trade.amount > 0 && (
          <Text style={styles.qty}>
            {trade.amount < 1 ? trade.amount.toFixed(6) : trade.amount.toFixed(2)} qty
          </Text>
        )}
        {trade.amount === 0 && trade.price > 0 && (
          <Text style={styles.qty}>@${trade.price.toLocaleString()}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  sideBadge: {
    width: 42,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  buyBadge: {backgroundColor: 'rgba(16,185,129,0.15)'},
  sellBadge: {backgroundColor: 'rgba(239,68,68,0.15)'},
  sideText: {fontFamily: 'Inter-SemiBold', fontSize: 10, letterSpacing: 0.5},
  buyText: {color: '#10B981'},
  sellText: {color: '#EF4444'},
  info: {flex: 1},
  symbolRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  symbol: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  modeBadge: {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4},
  modeText: {fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.5},
  botName: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  right: {alignItems: 'flex-end'},
  pnl: {fontFamily: 'Inter-SemiBold', fontSize: 14},
  price: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#FFFFFF'},
  qty: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1},
});
