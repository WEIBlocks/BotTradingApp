import { useState, useEffect, useCallback } from 'react';
import { Settings2, RefreshCw, Activity, Lock, Mail, Brain, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { adminService, type SystemSettings, type SystemHealth, type AiConfig } from '../services/admin';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-[#10B981]' : 'bg-white/10'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function HealthDot({ status }: { status: string }) {
  const ok = status === 'connected' || status === 'healthy' || status === 'ok';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${
        ok ? 'bg-[#10B981]' : 'bg-red-500'
      }`}
    />
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
  auto: 'Auto (first available key)',
};

// Local model list — mirrors backend AI_MODELS, latest as of June 2025
const MODELS_MAP: Record<string, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — Recommended (latest)' },
    { id: 'claude-opus-4-8',   label: 'Claude Opus 4.8 — Most capable, complex reasoning' },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 — Fastest & cheapest' },
  ],
  openai: [
    { id: 'gpt-4.1',      label: 'GPT-4.1 — Most capable' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — Recommended ⭐' },
    { id: 'gpt-4o',       label: 'GPT-4o — Multimodal flagship' },
    { id: 'gpt-4o-mini',  label: 'GPT-4o Mini — Fastest & cheapest' },
    { id: 'o3',           label: 'o3 — Advanced reasoning' },
    { id: 'o4-mini',      label: 'o4-mini — Fast reasoning' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro — Most capable' },
    { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash — Recommended ⭐' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — Fastest & cheapest' },
  ],
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'text-orange-400',
  openai: 'text-green-400',
  gemini: 'text-blue-400',
  auto: 'text-white/50',
};

export default function Settings() {
  const { user } = useAuth();

  // AI Config state
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [aiProvider, setAiProvider] = useState<'anthropic' | 'gemini' | 'openai' | 'auto'>('anthropic');
  const [aiModel, setAiModel] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const loadAiConfig = useCallback(async () => {
    setAiLoading(true);
    try {
      const cfg = await adminService.getAiConfig();
      setAiConfig(cfg);
      setAiProvider(cfg.provider as any);
      setAiModel(cfg.model || '');
    } catch (err) {
      console.error('Failed to load AI config:', err);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleSaveAiConfig = async () => {
    setAiSaving(true);
    setAiFeedback(null);
    try {
      const payload: any = { provider: aiProvider, model: aiModel };
      if (anthropicKey.trim()) payload.anthropicApiKey = anthropicKey.trim();
      if (openaiKey.trim()) payload.openaiApiKey = openaiKey.trim();
      if (geminiKey.trim()) payload.geminiApiKey = geminiKey.trim();
      const updated = await adminService.updateAiConfig(payload);
      setAiConfig(updated);
      setAiFeedback({ type: 'success', text: `Switched to ${PROVIDER_LABELS[aiProvider]} — active immediately.` });
      setAnthropicKey('');
      setOpenaiKey('');
      setGeminiKey('');
    } catch (err: any) {
      setAiFeedback({ type: 'error', text: err?.response?.data?.message || 'Failed to save AI config.' });
    } finally {
      setAiSaving(false);
    }
  };

  // Account state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setNewName(user.name || '');
      setNewEmail(user.email || '');
    }
  }, [user]);

  const handleChangePassword = async () => {
    setPasswordFeedback(null);
    if (!currentPassword || !newPassword) {
      setPasswordFeedback({ type: 'error', text: 'Please fill in all password fields' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setPasswordFeedback({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to change password';
      setPasswordFeedback({ type: 'error', text: msg });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleUpdateProfile = async () => {
    setProfileFeedback(null);
    if (!newName.trim()) {
      setProfileFeedback({ type: 'error', text: 'Name is required' });
      return;
    }
    setProfileSaving(true);
    try {
      await api.patch('/user/profile', { name: newName.trim() });
      setProfileFeedback({ type: 'success', text: 'Profile updated successfully' });
      // Update localStorage
      const saved = localStorage.getItem('admin_user');
      if (saved) {
        const u = JSON.parse(saved);
        u.name = newName.trim();
        localStorage.setItem('admin_user', JSON.stringify(u));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update profile';
      setProfileFeedback({ type: 'error', text: msg });
    } finally {
      setProfileSaving(false);
    }
  };

  // Settings state
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Form state
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [maxBotsPerCreator, setMaxBotsPerCreator] = useState(10);
  const [commissionRate, setCommissionRate] = useState(10);
  const [minWithdrawal, setMinWithdrawal] = useState(10);
  const [supportEmail, setSupportEmail] = useState('');

  // Health state
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const data = await adminService.getSettings();
      setSettings(data);
      setMaintenanceMode(data.maintenanceMode);
      setRegistrationEnabled(data.registrationEnabled);
      setMaxBotsPerCreator(data.maxBotsPerCreator ?? 10);
      setCommissionRate(data.defaultCommissionRate ?? 7);
      setMinWithdrawal(data.minWithdrawalAmount ?? 10);
      setSupportEmail(data.supportEmail);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const data = await adminService.getSystemHealth();
      setHealth(data);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Failed to load system health');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadHealth();
    loadAiConfig();
  }, [loadSettings, loadHealth, loadAiConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSettingsFeedback(null);
    try {
      const updated = await adminService.updateSettings({
        maintenanceMode,
        registrationEnabled,
        maxBotsPerUser: maxBotsPerCreator,
        commissionRate,
        minWithdrawal,
        supportEmail,
      });
      setSettings(updated);
      setSettingsFeedback({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err) {
      setSettingsFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const overallHealthOk =
    health?.status === 'healthy' || health?.status === 'ok';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <Settings2 size={22} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">Platform configuration & system health</p>
      </div>

      {/* Admin Account */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Admin Account</h2>

        {/* Profile */}
        <div className="mb-6 pb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Mail size={16} className="text-white/40" />
            <h3 className="text-white/70 text-sm font-semibold">Profile</h3>
          </div>

          {profileFeedback && (
            <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${profileFeedback.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {profileFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-white/40 text-xs font-medium block mb-1.5">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={newEmail}
                disabled
                className="w-full opacity-50 cursor-not-allowed"
                title="Email change requires verification — contact support"
              />
            </div>
          </div>
          <button
            onClick={handleUpdateProfile}
            disabled={profileSaving}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[#10B981] hover:bg-[#0d9668] text-white disabled:opacity-50 transition-colors"
          >
            {profileSaving ? 'Saving...' : 'Update Profile'}
          </button>
        </div>

        {/* Change Password */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Lock size={16} className="text-white/40" />
            <h3 className="text-white/70 text-sm font-semibold">Change Password</h3>
          </div>

          {passwordFeedback && (
            <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${passwordFeedback.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {passwordFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-white/40 text-xs font-medium block mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs font-medium block mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs font-medium block mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={passwordSaving}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[#10B981] hover:bg-[#0d9668] text-white disabled:opacity-50 transition-colors"
          >
            {passwordSaving ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </div>

      {/* Platform Settings */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Platform Settings</h2>

        {settingsError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
            {settingsError}
          </div>
        )}

        {settingsFeedback && (
          <div
            className={`text-sm rounded-lg px-4 py-3 mb-5 ${
              settingsFeedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {settingsFeedback.text}
          </div>
        )}

        {settingsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-36 bg-white/5 rounded animate-pulse" />
                <div className="h-6 w-20 bg-white/5 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : settings ? (
          <div className="space-y-5">
            {/* Maintenance Mode */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Maintenance Mode</p>
                <p className="text-white/30 text-xs mt-0.5">
                  Disables the platform for all non-admin users
                </p>
              </div>
              <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
            </div>

            {/* Registration */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Registration Enabled</p>
                <p className="text-white/30 text-xs mt-0.5">
                  Allow new users to create accounts
                </p>
              </div>
              <Toggle checked={registrationEnabled} onChange={setRegistrationEnabled} />
            </div>

            <div className="border-t border-white/[0.06] pt-5 space-y-4">
              {/* Max Bots */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="text-white text-sm font-medium">Max Bots Per Creator</label>
                <input
                  type="number"
                  min={1}
                  value={maxBotsPerCreator}
                  onChange={(e) => setMaxBotsPerCreator(Number(e.target.value))}
                  className="w-full sm:w-28 bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                />
              </div>

              {/* Commission Rate */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="text-white text-sm font-medium">Default Commission Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(Number(e.target.value))}
                  className="w-full sm:w-28 bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                />
              </div>

              {/* Min Withdrawal */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="text-white text-sm font-medium">Min Withdrawal Amount ($)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minWithdrawal}
                  onChange={(e) => setMinWithdrawal(Number(e.target.value))}
                  className="w-full sm:w-28 bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                />
              </div>

              {/* Support Email */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="text-white text-sm font-medium">Support Email</label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@example.com"
                  className="w-full sm:w-64 bg-[#0A0E14] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                />
              </div>
            </div>

            {/* Save */}
            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* AI Configuration */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <Brain size={18} className="text-[#10B981]" />
          <h2 className="text-lg font-semibold text-white">AI Model Configuration</h2>
        </div>

        {/* Active status badge */}
        {aiConfig && (
          <div className="flex items-center gap-2.5 mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <CheckCircle size={15} className="text-[#10B981] shrink-0" />
            <span className="text-sm text-white/60">
              Currently active: <span className={`font-semibold ${PROVIDER_COLORS[aiConfig.activeProvider ?? 'auto']}`}>
                {PROVIDER_LABELS[aiConfig.activeProvider ?? 'auto']}
              </span>
              {aiConfig.activeModel && (
                <span className="text-white/40 ml-2">— {aiConfig.activeModel}</span>
              )}
            </span>
          </div>
        )}

        {aiFeedback && (
          <div className={`text-sm rounded-lg px-4 py-3 mb-5 ${aiFeedback.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
            {aiFeedback.text}
          </div>
        )}

        {aiLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Provider selector */}
            <div>
              <label className="text-white/40 text-xs font-medium block mb-2">Primary AI Provider</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['anthropic', 'openai', 'gemini', 'auto'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setAiProvider(p); setAiModel(''); }}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                      aiProvider === p
                        ? 'border-[#10B981]/50 bg-[#10B981]/10 text-white'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {aiProvider === p && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />}
                      <span>{p === 'anthropic' ? 'Claude' : p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'Auto'}</span>
                    </div>
                    {aiConfig && (
                      <div className={`text-[10px] mt-0.5 ${
                        (p === 'anthropic' && aiConfig.hasAnthropicKey) ||
                        (p === 'openai' && aiConfig.hasOpenaiKey) ||
                        (p === 'gemini' && aiConfig.hasGeminiKey) ||
                        p === 'auto'
                          ? 'text-[#10B981]/70' : 'text-red-400/70'
                      }`}>
                        {p === 'auto' ? 'picks first key'
                          : p === 'anthropic' ? (aiConfig.hasAnthropicKey ? 'key configured' : 'no key')
                          : p === 'openai' ? (aiConfig.hasOpenaiKey ? 'key configured' : 'no key')
                          : (aiConfig.hasGeminiKey ? 'key configured' : 'no key')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector — always visible for specific providers */}
            {aiProvider !== 'auto' && MODELS_MAP[aiProvider] && (
              <div>
                <label className="text-white/40 text-xs font-medium block mb-2">Model</label>
                <select
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                >
                  <option value="">— Use default for {aiProvider} —</option>
                  {MODELS_MAP[aiProvider].map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* API Key fields */}
            <div className="border-t border-white/[0.06] pt-5">
              <p className="text-white/40 text-xs font-medium mb-3">Update API Keys (leave blank to keep existing)</p>
              <div className="space-y-3">
                {/* Anthropic */}
                <div>
                  <label className="text-white/40 text-xs flex items-center gap-1.5 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${aiConfig?.hasAnthropicKey ? 'bg-[#10B981]' : 'bg-red-400'}`} />
                    Anthropic API Key {aiConfig?.hasAnthropicKey ? '(configured)' : '(not set)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={e => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                    />
                    <button onClick={() => setShowAnthropicKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                      {showAnthropicKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* OpenAI */}
                <div>
                  <label className="text-white/40 text-xs flex items-center gap-1.5 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${aiConfig?.hasOpenaiKey ? 'bg-[#10B981]' : 'bg-red-400'}`} />
                    OpenAI API Key {aiConfig?.hasOpenaiKey ? '(configured)' : '(not set)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showOpenaiKey ? 'text' : 'password'}
                      value={openaiKey}
                      onChange={e => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                    />
                    <button onClick={() => setShowOpenaiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                      {showOpenaiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Gemini */}
                <div>
                  <label className="text-white/40 text-xs flex items-center gap-1.5 mb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${aiConfig?.hasGeminiKey ? 'bg-[#10B981]' : 'bg-red-400'}`} />
                    Google Gemini API Key {aiConfig?.hasGeminiKey ? '(configured)' : '(not set)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={e => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
                    />
                    <button onClick={() => setShowGeminiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                      {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveAiConfig}
                disabled={aiSaving}
                className="px-5 py-2.5 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiSaving ? 'Applying...' : 'Apply AI Config'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* System Health */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Activity size={18} className="text-[#10B981]" />
            <h2 className="text-lg font-semibold text-white">System Health</h2>
          </div>
          <button
            onClick={loadHealth}
            disabled={healthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
          >
            <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {healthError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
            {healthError}
          </div>
        )}

        {healthLoading && !health ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-white/5 animate-pulse" />
                <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : health ? (
          <div className="space-y-4">
            {/* Overall */}
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm w-24">Overall</span>
              <span
                className={`inline-block text-xs font-semibold px-3 py-1 rounded-full border ${
                  overallHealthOk
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                    : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
                }`}
              >
                {overallHealthOk ? 'Healthy' : 'Degraded'}
              </span>
            </div>

            {/* Database */}
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm w-24">Database</span>
              <HealthDot status={health.services.database} />
              <span className="text-white/40 text-sm capitalize">{health.services.database}</span>
            </div>

            {/* Redis */}
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm w-24">Redis</span>
              <HealthDot status={health.services.redis} />
              <span className="text-white/40 text-sm capitalize">{health.services.redis}</span>
            </div>

            {/* Timestamp */}
            <div className="border-t border-white/[0.06] pt-3 mt-3">
              <p className="text-white/20 text-xs">
                Last checked: {new Date(health.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
