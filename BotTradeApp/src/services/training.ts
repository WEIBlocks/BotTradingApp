import {api, uploadFormData} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadRow {
  id: string;
  botId: string;
  type: string;
  name: string;
  fileUrl: string | null;
  fileSize: number | null;
  status: string;
  analysisResult: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

interface DataWrap<T> { data: T }

// ─── Exposed Types ──────────────────────────────────────────────────────────

export interface TrainingUpload {
  id: string;
  botId: string;
  type: string;
  name: string;
  fileUrl: string | null;
  fileSize: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
  analysisResult: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface TrainingInsights {
  patterns: string[];
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  summaries: string[];
}

export interface TrainingSummary {
  total: number;
  complete: number;
  processing: number;
  pending: number;
  errors: number;
  trained: boolean;
  insights: TrainingInsights;
  uploads: TrainingUpload[];
}

// ─── Service ────────────────────────────────────────────────────────────────

export const trainingApi = {
  /** Upload a training file via multipart form data. */
  async uploadFile(botId: string, file: {uri: string; name: string; type: string}): Promise<TrainingUpload> {
    const formData = new FormData();
    formData.append('botId', botId);
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
    const res = await uploadFormData<DataWrap<UploadRow>>('/training/upload-file', formData);
    const u = res?.data;
    return mapUpload(u);
  },

  /** Upload a training file via JSON (legacy). */
  async upload(botId: string, type: string, name: string, fileUrl: string, fileSize: number): Promise<TrainingUpload> {
    const res = await api.post<DataWrap<UploadRow>>('/training/upload', {
      botId, type, name, fileUrl, fileSize,
    } as Record<string, unknown>);
    const u = res?.data;
    return mapUpload(u);
  },

  /** Get uploads for a bot. */
  async getUploads(botId: string): Promise<TrainingUpload[]> {
    const res = await api.get<DataWrap<UploadRow[]>>(`/training/uploads/${botId}`);
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(mapUpload);
  },

  /** Get training summary with aggregated insights. */
  async getSummary(botId: string): Promise<TrainingSummary> {
    const res = await api.get<DataWrap<TrainingSummary>>(`/training/summary/${botId}`);
    return res?.data ?? {
      total: 0, complete: 0, processing: 0, pending: 0, errors: 0,
      trained: false,
      insights: {patterns: [], indicators: [], entryRules: [], exitRules: [], summaries: []},
      uploads: [],
    };
  },

  /** Get single upload detail with analysis. */
  async getUploadDetail(uploadId: string): Promise<TrainingUpload | null> {
    const res = await api.get<DataWrap<UploadRow>>(`/training/upload/${uploadId}`);
    return res?.data ? mapUpload(res.data) : null;
  },

  /** Submit a YouTube URL for bot training (transcript extracted + stored in RAG). */
  async learnFromYoutube(botId: string, youtubeUrl: string): Promise<{title: string; chunksStored: number; hasTranscript: boolean}> {
    const res = await api.post<DataWrap<{title: string; chunksStored: number; hasTranscript: boolean}>>('/ai/youtube/learn', {
      url: youtubeUrl, botId,
    } as Record<string, unknown>);
    return res?.data ?? {title: 'Unknown', chunksStored: 0, hasTranscript: false};
  },

  /** Start training a bot. */
  async startTraining(botId: string) {
    return api.post<DataWrap<{
      message: string;
      filesProcessed: number;
      successCount: number;
      errorCount: number;
      results: Array<{
        id: string;
        name: string;
        type: string;
        status: string;
        analysis: Record<string, unknown> | null;
      }>;
    }>>('/training/start', {botId} as Record<string, unknown>);
  },
};

function mapUpload(u: UploadRow): TrainingUpload {
  return {
    id: u.id ?? '',
    botId: u.botId ?? '',
    type: u.type ?? 'document',
    name: u.name ?? 'Untitled',
    fileUrl: u.fileUrl ?? null,
    fileSize: u.fileSize ?? 0,
    status: (u.status ?? 'pending') as TrainingUpload['status'],
    analysisResult: u.analysisResult ?? null,
    errorMessage: u.errorMessage ?? null,
    createdAt: u.createdAt ?? new Date().toISOString(),
  };
}
