import React, {useState, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {useToast} from '../../context/ToastContext';
import {RootStackParamList} from '../../types';
import type {Trade} from '../../types';
import {tradesApi, TradeSummary} from '../../services/trades';
import TradeRow from '../../components/common/TradeRow';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'TradeHistory'>;

export default function TradeHistoryScreen({navigation}: Props) {
  const {alert: showAlert} = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<TradeSummary>({totalPnl: 0, totalTrades: 0, winRate: 0});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [historyRes, summaryRes] = await Promise.all([tradesApi.getHistory(), tradesApi.getSummary()]);
      setTrades(historyRes.trades);
      setSummary(summaryRes);
    } catch {
      showAlert('Error', 'Failed to load trade history. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  if (loading) {
    return (
      <View style={[styles.container, {alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

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
          <Text style={styles.summaryValue}>${summary.totalPnl.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total P&L</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.totalTrades}</Text>
          <Text style={styles.summaryLabel}>Total Trades</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(summary.winRate)}%</Text>
          <Text style={styles.summaryLabel}>Win Rate</Text>
        </View>
      </View>

      {trades.length === 0 ? (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32}}>
          <Text style={{fontSize: 48, marginBottom: 16}}>📊</Text>
          <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 8}}>No trades yet</Text>
          <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 19, marginBottom: 20}}>
            Start a shadow session or activate live trading{'\n'}to see your trade history here.
          </Text>
          <TouchableOpacity
            style={{backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10}}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('BotBuilder', {})}>
            <Text style={{fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#FFFFFF'}}>Create Bot</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trades}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({item}) => <TradeRow trade={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
              tintColor="#10B981"
              colors={['#10B981']}
              progressBackgroundColor="#161B22"
            />
          }
        />
      )}
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
