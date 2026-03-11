import React from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockTrades} from '../../data/mockTrades';
import TradeRow from '../../components/common/TradeRow';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'TradeHistory'>;

export default function TradeHistoryScreen({navigation}: Props) {
  const totalPnl = mockTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const wins = mockTrades.filter(t => (t.pnl || 0) > 0).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade History</Text>
        <View style={{width: 40}} />
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>${totalPnl.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total P&L</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{mockTrades.length}</Text>
          <Text style={styles.summaryLabel}>Total Trades</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round((wins / mockTrades.length) * 100)}%</Text>
          <Text style={styles.summaryLabel}>Win Rate</Text>
        </View>
      </View>

      <FlatList
        data={mockTrades}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({item}) => <TradeRow trade={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  iconBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  summary: {flexDirection: 'row', paddingHorizontal: 20, marginBottom: 8, backgroundColor: '#161B22', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)'},
  summaryItem: {flex: 1, alignItems: 'center'},
  summaryValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#10B981', marginBottom: 2},
  summaryLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5},
  listContent: {paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32},
});
