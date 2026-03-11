import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {mockBots} from '../../data/mockBots';
import MiniLineChart from '../../components/charts/MiniLineChart';
import Badge from '../../components/common/Badge';
import ChevronLeftIcon from '../../components/icons/ChevronLeftIcon';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'ShadowMode'>;

const SHADOW_BOTS = [
  {botId: 'bot1', profit: 480, winRate: 72, days: 14, totalDays: 14},
  {botId: 'bot4', profit: 192, winRate: 65, days: 7, totalDays: 30},
];

export default function ShadowModeScreen({navigation}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shadow Mode</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Running virtual simulations with your portfolio size. No real trades executed.</Text>

        {SHADOW_BOTS.map(sb => {
          const bot = mockBots.find(b => b.id === sb.botId) || mockBots[0];
          const progress = sb.days / sb.totalDays;
          const isComplete = sb.days === sb.totalDays;

          return (
            <TouchableOpacity
              key={sb.botId}
              style={styles.shadowCard}
              onPress={() => navigation.navigate('ShadowModeResults', {botId: sb.botId, profit: sb.profit, winRate: sb.winRate})}
              activeOpacity={0.8}>
              <View style={styles.shadowCardTop}>
                <View style={[styles.avatar, {backgroundColor: bot.avatarColor}]}>
                  <Text style={styles.avatarText}>{bot.avatarLetter}</Text>
                </View>
                <View style={styles.shadowInfo}>
                  <Text style={styles.shadowBotName}>{bot.name}</Text>
                  <Badge
                    label={isComplete ? 'COMPLETE' : `DAY ${sb.days}/${sb.totalDays}`}
                    variant={isComplete ? 'green' : 'blue'}
                    size="sm"
                  />
                </View>
                <MiniLineChart data={bot.equityData} width={70} height={36} color="#10B981" />
              </View>

              <View style={styles.shadowStats}>
                <View style={styles.shadowStat}>
                  <Text style={styles.shadowStatValue}>+${sb.profit}</Text>
                  <Text style={styles.shadowStatLabel}>Virtual Profit</Text>
                </View>
                <View style={styles.shadowStat}>
                  <Text style={styles.shadowStatValue}>{sb.winRate}%</Text>
                  <Text style={styles.shadowStatLabel}>Win Rate</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {width: `${progress * 100}%` as any}]} />
                </View>
              </View>

              {isComplete && (
                <View style={styles.completeRow}>
                  <Text style={styles.completeText}>Trial Complete — View Results</Text>
                  <ChevronRightIcon size={16} color="#10B981" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.addShadowBtn}>
          <Text style={styles.addShadowText}>+ Add Another Bot to Shadow Mode</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0F1117'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12},
  backBtn: {width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontFamily: 'Inter-Bold', fontSize: 20, color: '#FFFFFF'},
  scroll: {paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40},
  subtitle: {fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 18, marginBottom: 20},
  shadowCard: {backgroundColor: '#161B22', borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)'},
  shadowCardTop: {flexDirection: 'row', alignItems: 'center', marginBottom: 14},
  avatar: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12},
  avatarText: {fontFamily: 'Inter-Bold', fontSize: 16, color: '#FFFFFF'},
  shadowInfo: {flex: 1, gap: 4},
  shadowBotName: {fontFamily: 'Inter-SemiBold', fontSize: 15, color: '#FFFFFF'},
  shadowStats: {flexDirection: 'row', gap: 16, alignItems: 'center'},
  shadowStat: {},
  shadowStatValue: {fontFamily: 'Inter-Bold', fontSize: 18, color: '#10B981'},
  shadowStatLabel: {fontFamily: 'Inter-Regular', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1},
  progressBar: {flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: '#10B981', borderRadius: 2},
  completeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6, padding: 10, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10},
  completeText: {fontFamily: 'Inter-SemiBold', fontSize: 13, color: '#10B981'},
  addShadowBtn: {height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', marginTop: 4},
  addShadowText: {fontFamily: 'Inter-Medium', fontSize: 14, color: 'rgba(255,255,255,0.35)'},
});
