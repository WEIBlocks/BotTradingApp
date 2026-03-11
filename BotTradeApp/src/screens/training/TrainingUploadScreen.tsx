import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Svg, {Path, Rect, Circle} from 'react-native-svg';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type UploadTab = 'Images' | 'Videos' | 'Documents';

interface MockUpload {
  id: string;
  type: 'image' | 'video' | 'document';
  name: string;
  status: 'complete' | 'processing' | 'error';
  timestamp: string;
}

const MOCK_UPLOADS: MockUpload[] = [
  {id: '1', type: 'image', name: 'BTC_chart_analysis.png', status: 'complete', timestamp: '2 hours ago'},
  {id: '2', type: 'video', name: 'Scalping_strategy.mp4', status: 'processing', timestamp: '45 min ago'},
  {id: '3', type: 'document', name: 'Trading_guide.pdf', status: 'complete', timestamp: '1 day ago'},
  {id: '4', type: 'image', name: 'ETH_patterns.png', status: 'error', timestamp: '3 hours ago'},
];

// ─── Icons ──────────────────────────────────────────────────────────────────

function BackArrow() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BrainIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a5 5 0 015 5v0a5 5 0 01-1 3 5 5 0 013 4.5A4.5 4.5 0 0114.5 19H14"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 2a5 5 0 00-5 5v0a5 5 0 001 3 5 5 0 00-3 4.5A4.5 4.5 0 009.5 19H10"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 2v20"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={9} r={1.5} fill="#10B981" />
      <Circle cx={9} cy={13} r={1} fill="#10B981" />
      <Circle cx={15} cy={13} r={1} fill="#10B981" />
    </Svg>
  );
}

function UploadArrowIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M17 8l-5-5-5 5M12 3v12"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ImageFileIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={3}
        width={18}
        height={18}
        rx={3}
        stroke="#10B981"
        strokeWidth={1.5}
      />
      <Circle cx={8.5} cy={8.5} r={1.5} fill="#10B981" />
      <Path
        d="M3 16l5-5 4 4 3-3 4 4"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function VideoFileIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={4}
        width={15}
        height={16}
        rx={3}
        stroke="#8B5CF6"
        strokeWidth={1.5}
      />
      <Path
        d="M17 9l5-3v12l-5-3V9z"
        stroke="#8B5CF6"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DocFileIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="#F59E0B"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
        stroke="#F59E0B"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  switch (type) {
    case 'video':
      return <VideoFileIcon />;
    case 'document':
      return <DocFileIcon />;
    default:
      return <ImageFileIcon />;
  }
}

function StatusBadge({status}: {status: string}) {
  let bg = '#10B981';
  let color = '#FFFFFF';
  let label = 'Complete';

  if (status === 'processing') {
    bg = '#F59E0B';
    label = 'Processing...';
  } else if (status === 'error') {
    bg = '#EF4444';
    label = 'Error';
  }

  return (
    <View style={[badgeStyles.badge, {backgroundColor: bg + '22'}]}>
      <Text style={[badgeStyles.text, {color: bg}]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  text: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingUploadScreen() {
  const navigation = useNavigation<Nav>();
  const [activeTab, setActiveTab] = useState<UploadTab>('Images');

  const handleUploadTap = () => {
    Alert.alert('File picker would open here');
  };

  const handleStartTraining = () => {
    Alert.alert('Training initiated!');
  };

  const tabs: UploadTab[] = ['Images', 'Videos', 'Documents'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <BackArrow />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Train Your Bot</Text>
        <View style={{width: 22}} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <BrainIcon />
            <Text style={styles.infoText}>
              Upload trading charts, strategy videos, or documents to improve
              your bot's intelligence. AI will analyze and learn from your
              materials.
            </Text>
          </View>
        </View>

        {/* Upload Type Tabs */}
        <View style={styles.tabsRow}>
          {tabs.map(tab => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab)}>
                <Text
                  style={[
                    styles.tabText,
                    isActive && styles.tabTextActive,
                  ]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Upload Area */}
        <TouchableOpacity
          style={styles.uploadArea}
          activeOpacity={0.7}
          onPress={handleUploadTap}>
          <UploadArrowIcon />
          <Text style={styles.uploadTitle}>Tap to upload</Text>
          <Text style={styles.uploadSubtitle}>
            Supports PNG, JPG, MP4, PDF
          </Text>
        </TouchableOpacity>

        {/* Previous Uploads */}
        <Text style={styles.sectionTitle}>Previous Uploads</Text>
        <View style={styles.card}>
          {MOCK_UPLOADS.map((upload, index) => (
            <View key={upload.id}>
              <View style={styles.uploadRow}>
                <View style={styles.uploadIcon}>{getFileIcon(upload.type)}</View>
                <View style={styles.uploadInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {upload.name}
                  </Text>
                  <Text style={styles.fileTimestamp}>{upload.timestamp}</Text>
                </View>
                <StatusBadge status={upload.status} />
              </View>
              {index < MOCK_UPLOADS.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        {/* Start Training Button */}
        <TouchableOpacity
          style={styles.trainBtn}
          activeOpacity={0.8}
          onPress={handleStartTraining}>
          <Text style={styles.trainBtnText}>Start Training</Text>
        </TouchableOpacity>

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  infoCard: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
    lineHeight: 20,
  },
  tabsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#10B981',
  },
  tabText: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  tabTextActive: {
    color: '#10B981',
    fontFamily: 'Inter-SemiBold',
  },
  uploadArea: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 6,
  },
  uploadTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  uploadSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 4,
    marginBottom: 24,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  uploadIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadInfo: {
    flex: 1,
  },
  fileName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  fileTimestamp: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 12,
  },
  trainBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
