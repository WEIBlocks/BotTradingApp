import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadRow {
  id: string;
  botId: string;
  type: string;
  name: string;
  fileUrl: string | null;
  fileSize: number | null;
  status: string;
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
  createdAt: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const trainingApi = {
  /** Upload a training file. */
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

  /** Start training a bot. */
  async startTraining(botId: string) {
    return api.post<DataWrap<{message: string}>>('/training/start', {botId} as Record<string, unknown>);
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
    createdAt: u.createdAt ?? new Date().toISOString(),
  };
}
