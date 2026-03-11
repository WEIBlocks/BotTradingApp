import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Trade} from '../../types';

interface TradeRowProps {
  trade: Trade;
}

export default function TradeRow({trade}: TradeRowProps) {
  const isBuy = trade.side === 'BUY';
  const pnlColor = (trade.pnl ?? 0) >= 0 ? '#10B981' : '#EF4444';
  const pnlSign = (trade.pnl ?? 0) >= 0 ? '+' : '';

  return (
    <View style={styles.container}>
      <View style={[styles.sideBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
        <Text style={[styles.sideText, isBuy ? styles.buyText : styles.sellText]}>
          {trade.side}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.symbol}>{trade.symbol}</Text>
        <Text style={styles.botName}>{trade.botName}</Text>
      </View>
      <View style={styles.right}>
        {trade.pnl !== undefined && (
          <Text style={[styles.pnl, {color: pnlColor}]}>
            {pnlSign}${Math.abs(trade.pnl).toFixed(2)}
          </Text>
        )}
        <Text style={styles.price}>${trade.price.toLocaleString()}</Text>
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
  symbol: {fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'},
  botName: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1},
  right: {alignItems: 'flex-end'},
  pnl: {fontFamily: 'Inter-SemiBold', fontSize: 14},
  price: {fontFamily: 'Inter-Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1},
});
