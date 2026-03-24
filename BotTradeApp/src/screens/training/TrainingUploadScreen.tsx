import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Svg, {Path, Rect, Circle, Line} from 'react-native-svg';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../types';
import {useToast} from '../../context/ToastContext';
import DocumentPicker, {types} from 'react-native-document-picker';
import {
  trainingApi,
  TrainingUpload,
  TrainingSummary,
} from '../../services/training';
import {creatorApi, CreatorBot} from '../../services/creator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TrainingUpload'>;

type UploadTab = 'Images' | 'Videos' | 'Documents';
type ScreenView = 'upload' | 'results';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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

function CheckCircleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#10B981" strokeWidth={1.5} />
      <Path
        d="M8 12l3 3 5-5"
        stroke="#10B981"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AlertTriangleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        stroke="#EF4444"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={12} y1={9} x2={12} y2={13} stroke="#EF4444" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={0.5} fill="#EF4444" />
    </Svg>
  );
}

function ChartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 20V10M12 20V4M6 20v-6"
        stroke="#10B981"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function TargetIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke="#8B5CF6" strokeWidth={1.5} />
      <Circle cx={12} cy={12} r={6} stroke="#8B5CF6" strokeWidth={1.5} />
      <Circle cx={12} cy={12} r={2} fill="#8B5CF6" />
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
  let label = 'Complete';

  if (status === 'pending') {
    bg = '#6B7280';
    label = 'Pending';
  } else if (status === 'processing') {
    bg = '#F59E0B';
    label = 'Analyzing...';
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

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({progress, label}: {progress: number; label: string}) {
  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.labelRow}>
        <Text style={progressStyles.label}>{label}</Text>
        <Text style={progressStyles.percent}>{Math.round(progress * 100)}%</Text>
      </View>
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, {width: `${Math.round(progress * 100)}%`}]} />
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {marginBottom: 12},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
  label: {fontFamily: 'Inter-Medium', fontSize: 12, color: 'rgba(255,255,255,0.6)'},
  percent: {fontFamily: 'Inter-SemiBold', fontSize: 12, color: '#10B981'},
  track: {height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)'},
  fill: {height: 6, borderRadius: 3, backgroundColor: '#10B981'},
});

// ─── Analysis Detail Card ───────────────────────────────────────────────────

function AnalysisCard({upload}: {upload: TrainingUpload}) {
  const [expanded, setExpanded] = useState(false);
  const analysis = upload.analysisResult;

  if (!analysis && upload.status !== 'error') return null;

  return (
    <View style={analysisStyles.card}>
      <TouchableOpacity
        style={analysisStyles.header}
        activeOpacity={0.7}
        onPress={() => setExpanded(!expanded)}>
        <View style={analysisStyles.headerLeft}>
          <View style={analysisStyles.fileIcon}>{getFileIcon(upload.type)}</View>
          <View style={{flex: 1}}>
            <Text style={analysisStyles.fileName} numberOfLines={1}>{upload.name}</Text>
            <Text style={analysisStyles.fileSize}>
              {upload.fileSize > 0 ? formatBytes(upload.fileSize) + ' · ' : ''}
              {upload.type}
            </Text>
          </View>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <StatusBadge status={upload.status} />
          <Text style={analysisStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={analysisStyles.body}>
          {upload.status === 'error' && (
            <View style={analysisStyles.errorBox}>
              <AlertTriangleIcon />
              <Text style={analysisStyles.errorText}>
                {upload.errorMessage || 'Analysis failed'}
              </Text>
            </View>
          )}

          {analysis && upload.status === 'complete' && (
            <>
              {/* Summary */}
              {typeof analysis.summary === 'string' && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Summary</Text>
                  <Text style={analysisStyles.sectionText}>{analysis.summary}</Text>
                </View>
              )}

              {/* Patterns (image analysis) */}
              {Array.isArray(analysis.patterns) && analysis.patterns.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Patterns Found</Text>
                  <View style={analysisStyles.tagRow}>
                    {(analysis.patterns as string[]).map((p, i) => (
                      <View key={i} style={analysisStyles.tag}>
                        <Text style={analysisStyles.tagText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Trend (image analysis) */}
              {analysis.trend && typeof analysis.trend === 'object' && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Trend</Text>
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <View style={[analysisStyles.tag, {backgroundColor: 'rgba(16,185,129,0.12)'}]}>
                      <Text style={[analysisStyles.tagText, {color: '#10B981'}]}>
                        {(analysis.trend as any).direction}
                      </Text>
                    </View>
                    <View style={analysisStyles.tag}>
                      <Text style={analysisStyles.tagText}>
                        {(analysis.trend as any).strength}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Support/Resistance (image analysis) */}
              {Array.isArray(analysis.supportLevels) && analysis.supportLevels.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Support Levels</Text>
                  <Text style={analysisStyles.sectionText}>
                    {(analysis.supportLevels as string[]).join(', ')}
                  </Text>
                </View>
              )}
              {Array.isArray(analysis.resistanceLevels) && analysis.resistanceLevels.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Resistance Levels</Text>
                  <Text style={analysisStyles.sectionText}>
                    {(analysis.resistanceLevels as string[]).join(', ')}
                  </Text>
                </View>
              )}

              {/* Trade Setup (image analysis) */}
              {typeof analysis.tradeSetup === 'string' && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Trade Setup</Text>
                  <Text style={analysisStyles.sectionText}>{analysis.tradeSetup}</Text>
                </View>
              )}

              {/* Confidence (image analysis) */}
              {typeof analysis.confidence === 'number' && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Confidence</Text>
                  <ProgressBar
                    progress={analysis.confidence / 100}
                    label={`${analysis.confidence}% confidence`}
                  />
                </View>
              )}

              {/* Entry/Exit Rules (document analysis) */}
              {Array.isArray(analysis.entryRules) && analysis.entryRules.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Entry Rules</Text>
                  {(analysis.entryRules as string[]).map((r, i) => (
                    <View key={i} style={analysisStyles.ruleRow}>
                      <TargetIcon />
                      <Text style={analysisStyles.ruleText}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}
              {Array.isArray(analysis.exitRules) && analysis.exitRules.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Exit Rules</Text>
                  {(analysis.exitRules as string[]).map((r, i) => (
                    <View key={i} style={analysisStyles.ruleRow}>
                      <TargetIcon />
                      <Text style={analysisStyles.ruleText}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Strategy Type (document analysis) */}
              {typeof analysis.strategyType === 'string' && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Strategy Type</Text>
                  <Text style={analysisStyles.sectionText}>{analysis.strategyType}</Text>
                </View>
              )}

              {/* Indicators */}
              {Array.isArray(analysis.indicators) && analysis.indicators.length > 0 && (
                <View style={analysisStyles.section}>
                  <Text style={analysisStyles.sectionTitle}>Indicators</Text>
                  <View style={analysisStyles.tagRow}>
                    {(analysis.indicators as any[]).map((ind, i) => (
                      <View key={i} style={[analysisStyles.tag, {backgroundColor: 'rgba(139,92,246,0.12)'}]}>
                        <Text style={[analysisStyles.tagText, {color: '#8B5CF6'}]}>
                          {typeof ind === 'string' ? ind : ind?.name || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Note (video or no-provider) */}
              {typeof analysis.note === 'string' && (
                <View style={analysisStyles.noteBox}>
                  <Text style={analysisStyles.noteText}>{analysis.note}</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const analysisStyles = StyleSheet.create({
  card: {
    backgroundColor: '#161B22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#FFFFFF',
  },
  fileSize: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  chevron: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 12,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sectionText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  ruleText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: '#EF4444',
    flex: 1,
  },
  noteBox: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 10,
    padding: 12,
  },
  noteText: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(245,158,11,0.85)',
    lineHeight: 18,
  },
});

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingUploadScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {alert: showAlert} = useToast();
  const paramBotId = route.params?.botId;

  const [activeTab, setActiveTab] = useState<UploadTab>('Images');
  const [uploads, setUploads] = useState<TrainingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [training, setTraining] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(paramBotId || null);
  const [userBots, setUserBots] = useState<CreatorBot[]>([]);
  const [screenView, setScreenView] = useState<ScreenView>('upload');
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [trainingInProgress, setTrainingInProgress] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  // Pulse animation for training
  useEffect(() => {
    if (training) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {toValue: 1, duration: 800, useNativeDriver: true}),
          Animated.timing(pulseAnim, {toValue: 0.3, duration: 800, useNativeDriver: true}),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [training]);

  // Fetch user's bots to allow selection if no botId provided
  useEffect(() => {
    if (!paramBotId) {
      creatorApi.getBots()
        .then(bots => {
          setUserBots(bots);
          if (bots.length > 0 && !selectedBotId) {
            setSelectedBotId(bots[0].id);
          }
        })
        .catch(() => {});
    }
  }, [paramBotId]);

  const loadUploads = useCallback(() => {
    if (!selectedBotId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    trainingApi.getUploads(selectedBotId)
      .then(setUploads)
      .catch(() => setUploads([]))
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const loadSummary = useCallback(() => {
    if (!selectedBotId) return;
    trainingApi.getSummary(selectedBotId)
      .then(setSummary)
      .catch(() => {});
  }, [selectedBotId]);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  const getAllowedTypes = () => {
    switch (activeTab) {
      case 'Images': return [types.images];
      case 'Videos': return [types.video];
      case 'Documents': return [types.pdf, types.csv, types.plainText, types.doc, types.docx];
      default: return [types.allFiles];
    }
  };

  const handleUploadTap = async () => {
    if (!selectedBotId) {
      showAlert('Select a Bot', 'Please select a bot to train first.');
      return;
    }
    try {
      const result = await DocumentPicker.pick({
        type: getAllowedTypes(),
        allowMultiSelection: true,
      });

      setUploading(true);
      let successCount = 0;
      let errorCount = 0;

      for (const file of result) {
        try {
          const uploaded = await trainingApi.uploadFile(selectedBotId, {
            uri: file.uri,
            name: file.name || 'Untitled',
            type: file.type || 'application/octet-stream',
          });
          setUploads(prev => [uploaded, ...prev]);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      setUploading(false);

      if (errorCount > 0 && successCount > 0) {
        showAlert('Upload Complete', `${successCount} file(s) uploaded, ${errorCount} failed.`);
      } else if (errorCount > 0) {
        showAlert('Upload Failed', 'Could not upload the selected file(s). Please try again.');
      }
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) return;
      setUploading(false);
      showAlert('Error', err?.message || 'Could not open file picker.');
    }
  };

  const handleStartTraining = async () => {
    if (!selectedBotId) {
      showAlert('Select a Bot', 'Please select a bot to train first.');
      return;
    }
    const pendingFiles = uploads.filter(u => u.status === 'pending');
    if (pendingFiles.length === 0) {
      showAlert('No Pending Files', 'All files have already been analyzed, or upload some training data first.');
      return;
    }

    setTraining(true);
    setTrainingInProgress(true);
    setTrainingProgress(0);
    setCurrentFile(pendingFiles[0]?.name || '');

    // Simulate progress updates while waiting for the API
    const totalFiles = pendingFiles.length;
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let fakeProgress = 0;

    progressInterval = setInterval(() => {
      fakeProgress += 0.02;
      if (fakeProgress > 0.9) fakeProgress = 0.9;
      setTrainingProgress(fakeProgress);
      // Cycle through file names
      const idx = Math.min(
        Math.floor(fakeProgress * totalFiles),
        totalFiles - 1,
      );
      setCurrentFile(pendingFiles[idx]?.name || '');
    }, 500);

    try {
      await trainingApi.startTraining(selectedBotId);
      if (progressInterval) clearInterval(progressInterval);
      setTrainingProgress(1);
      setCurrentFile('Complete!');

      // Refresh uploads and load summary
      await Promise.all([loadUploads(), loadSummary()]);

      // Wait a beat then show results
      setTimeout(() => {
        setTraining(false);
        setTrainingInProgress(false);
        setScreenView('results');
      }, 800);
    } catch (e: any) {
      if (progressInterval) clearInterval(progressInterval);
      setTraining(false);
      setTrainingInProgress(false);
      showAlert('Training Failed', e?.message || 'Could not complete training.');
      loadUploads(); // Refresh to get any partial results
    }
  };

  const handleViewResults = () => {
    loadSummary();
    setScreenView('results');
  };

  const tabs: UploadTab[] = ['Images', 'Videos', 'Documents'];
  const pendingCount = uploads.filter(u => u.status === 'pending').length;
  const completeCount = uploads.filter(u => u.status === 'complete').length;

  // ─── Results View ───────────────────────────────────────────────────────

  if (screenView === 'results') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setScreenView('upload')}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <BackArrow />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Training Results</Text>
          <View style={{width: 22}} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>

          {/* Training Stats Overview */}
          {summary && (
            <View style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{summary.total}</Text>
                  <Text style={styles.statLabel}>Total Files</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, {color: '#10B981'}]}>{summary.complete}</Text>
                  <Text style={styles.statLabel}>Analyzed</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, {color: summary.errors > 0 ? '#EF4444' : '#6B7280'}]}>{summary.errors}</Text>
                  <Text style={styles.statLabel}>Errors</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, {color: '#F59E0B'}]}>{summary.pending}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
              </View>

              {summary.trained && (
                <View style={styles.trainedBadge}>
                  <CheckCircleIcon />
                  <Text style={styles.trainedText}>Bot has been trained with your data</Text>
                </View>
              )}
            </View>
          )}

          {/* Aggregated Insights */}
          {summary && summary.trained && (
            <View style={styles.insightsCard}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14}}>
                <ChartIcon />
                <Text style={styles.insightsTitle}>Learned Insights</Text>
              </View>

              {summary.insights.patterns.length > 0 && (
                <View style={{marginBottom: 14}}>
                  <Text style={styles.insightLabel}>Patterns Detected</Text>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                    {summary.insights.patterns.map((p, i) => (
                      <View key={i} style={styles.insightTag}>
                        <Text style={styles.insightTagText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {summary.insights.indicators.length > 0 && (
                <View style={{marginBottom: 14}}>
                  <Text style={styles.insightLabel}>Indicators Used</Text>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                    {summary.insights.indicators.map((ind, i) => (
                      <View key={i} style={[styles.insightTag, {backgroundColor: 'rgba(139,92,246,0.12)'}]}>
                        <Text style={[styles.insightTagText, {color: '#8B5CF6'}]}>{ind}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {summary.insights.entryRules.length > 0 && (
                <View style={{marginBottom: 14}}>
                  <Text style={styles.insightLabel}>Entry Rules</Text>
                  {summary.insights.entryRules.map((r, i) => (
                    <View key={i} style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
                      <TargetIcon />
                      <Text style={styles.insightRuleText}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {summary.insights.exitRules.length > 0 && (
                <View style={{marginBottom: 14}}>
                  <Text style={styles.insightLabel}>Exit Rules</Text>
                  {summary.insights.exitRules.map((r, i) => (
                    <View key={i} style={{flexDirection: 'row', gap: 6, marginBottom: 4}}>
                      <TargetIcon />
                      <Text style={styles.insightRuleText}>{r}</Text>
                    </View>
                  ))}
                </View>
              )}

              {summary.insights.summaries.length > 0 && (
                <View>
                  <Text style={styles.insightLabel}>AI Summaries</Text>
                  {summary.insights.summaries.map((s, i) => (
                    <Text key={i} style={[styles.insightRuleText, {marginBottom: 8}]}>{s}</Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Per-File Analysis Details */}
          <Text style={styles.sectionTitle}>File Analysis Details</Text>
          {uploads.filter(u => u.status === 'complete' || u.status === 'error').length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No analysis results yet. Train your bot first.</Text>
            </View>
          ) : (
            uploads
              .filter(u => u.status === 'complete' || u.status === 'error')
              .map(u => <AnalysisCard key={u.id} upload={u} />)
          )}

          {/* Back to Upload Button */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.8}
            onPress={() => setScreenView('upload')}>
            <Text style={styles.secondaryBtnText}>Upload More Data</Text>
          </TouchableOpacity>

          <View style={{height: 40}} />
        </ScrollView>
      </View>
    );
  }

  // ─── Upload View (default) ──────────────────────────────────────────────

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
        {completeCount > 0 ? (
          <TouchableOpacity onPress={handleViewResults} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={styles.resultsLink}>Results</Text>
          </TouchableOpacity>
        ) : (
          <View style={{width: 22}} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Training Progress Overlay */}
        {training && (
          <View style={styles.trainingCard}>
            <Animated.View style={{opacity: pulseAnim}}>
              <BrainIcon />
            </Animated.View>
            <Text style={styles.trainingTitle}>AI is analyzing your data...</Text>
            <Text style={styles.trainingFile} numberOfLines={1}>{currentFile}</Text>
            <ProgressBar
              progress={trainingProgress}
              label={`${Math.round(trainingProgress * 100)}% complete`}
            />
            <Text style={styles.trainingHint}>
              This may take a moment depending on file count
            </Text>
          </View>
        )}

        {!training && trainingInProgress && (
          <View style={styles.trainingBanner}>
            <ActivityIndicator size="small" color="#F59E0B" style={{marginRight: 10}} />
            <Text style={styles.trainingBannerText}>
              Training in progress... Your bot is learning from the uploaded data. This may take a few minutes.
            </Text>
          </View>
        )}

        {!training && (
          <>
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

            {/* Bot Selector (when no botId passed) */}
            {!paramBotId && userBots.length > 0 && (
              <View style={styles.botSelector}>
                <Text style={styles.botSelectorLabel}>SELECT BOT TO TRAIN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -20}} contentContainerStyle={{paddingHorizontal: 20, gap: 8}}>
                  {userBots.map(bot => (
                    <TouchableOpacity
                      key={bot.id}
                      style={[styles.botChip, selectedBotId === bot.id && styles.botChipActive]}
                      onPress={() => setSelectedBotId(bot.id)}
                      activeOpacity={0.7}>
                      <Text style={[styles.botChipText, selectedBotId === bot.id && styles.botChipTextActive]}>
                        {bot.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {!paramBotId && userBots.length === 0 && !loading && (
              <View style={styles.noBotsBanner}>
                <Text style={styles.noBotsBannerText}>Create a bot first in the Bot Builder to start training.</Text>
              </View>
            )}

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
              onPress={handleUploadTap}
              disabled={uploading}>
              {uploading ? (
                <>
                  <ActivityIndicator size="small" color="#10B981" />
                  <Text style={styles.uploadTitle}>Uploading...</Text>
                </>
              ) : (
                <>
                  <UploadArrowIcon />
                  <Text style={styles.uploadTitle}>Tap to upload</Text>
                  <Text style={styles.uploadSubtitle}>
                    Supports PNG, JPG, MP4, PDF, CSV, TXT
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Previous Uploads */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Uploads {uploads.length > 0 ? `(${uploads.length})` : ''}
              </Text>
              {pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
                </View>
              )}
            </View>
            <View style={styles.card}>
              {loading ? (
                <View style={{padding: 24, alignItems: 'center'}}>
                  <ActivityIndicator color="#10B981" size="small" />
                </View>
              ) : uploads.length === 0 ? (
                <View style={{padding: 24, alignItems: 'center'}}>
                  <Text style={{fontFamily: 'Inter-Regular', fontSize: 13, color: 'rgba(255,255,255,0.4)'}}>
                    No uploads yet
                  </Text>
                </View>
              ) : (
                uploads.map((upload, index) => (
                  <View key={upload.id ?? index}>
                    <View style={styles.uploadRow}>
                      <View style={styles.uploadIcon}>{getFileIcon(upload.type)}</View>
                      <View style={styles.uploadInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>
                          {upload.name}
                        </Text>
                        <Text style={styles.fileTimestamp}>
                          {upload.fileSize > 0 ? formatBytes(upload.fileSize) + ' · ' : ''}
                          {upload.createdAt ? timeAgo(upload.createdAt) : ''}
                        </Text>
                      </View>
                      <StatusBadge status={upload.status} />
                    </View>
                    {index < uploads.length - 1 && (
                      <View style={styles.divider} />
                    )}
                  </View>
                ))
              )}
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              style={[styles.trainBtn, pendingCount === 0 && styles.trainBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleStartTraining}
              disabled={training || pendingCount === 0}>
              <Text style={styles.trainBtnText}>
                {pendingCount > 0
                  ? `Analyze ${pendingCount} File${pendingCount > 1 ? 's' : ''}`
                  : 'All Files Analyzed'}
              </Text>
            </TouchableOpacity>

            {completeCount > 0 && (
              <TouchableOpacity
                style={styles.viewResultsBtn}
                activeOpacity={0.8}
                onPress={handleViewResults}>
                <ChartIcon />
                <Text style={styles.viewResultsBtnText}>View Training Results</Text>
              </TouchableOpacity>
            )}
          </>
        )}

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
  resultsLink: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#10B981',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Training Progress
  trainingCard: {
    backgroundColor: '#161B22',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  trainingTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 4,
  },
  trainingFile: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
    maxWidth: '80%',
  },
  trainingHint: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },

  // Info Card
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

  // Tabs
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

  // Upload Area
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

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  pendingBadge: {
    backgroundColor: 'rgba(107,114,128,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: '#6B7280',
  },

  // Upload List
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

  // Buttons
  trainBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainBtnDisabled: {
    backgroundColor: 'rgba(16,185,129,0.3)',
  },
  trainBtnText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  viewResultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    paddingVertical: 14,
    marginTop: 12,
  },
  viewResultsBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: '#10B981',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },

  // Results View - Stats
  statsCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  trainedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  trainedText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: '#10B981',
  },

  // Insights
  insightsCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
    padding: 18,
    marginBottom: 20,
  },
  insightsTitle: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  insightLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  insightTag: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  insightTagText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: '#10B981',
  },
  insightRuleText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    lineHeight: 20,
  },

  // Empty
  emptyCard: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },

  // Bot Selector
  botSelector: {
    marginBottom: 20,
  },
  botSelectorLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 10,
  },
  botChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginRight: 10,
  },
  botChipActive: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: '#10B981',
  },
  botChipText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  botChipTextActive: {
    color: '#10B981',
  },
  noBotsBanner: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  noBotsBannerText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(245,158,11,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  trainingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    padding: 16,
    marginBottom: 16,
  },
  trainingBannerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    color: 'rgba(245,158,11,0.9)',
    flex: 1,
    lineHeight: 20,
  },
});
