import { useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { adminService } from '../services/admin';

type Target = 'all' | 'subscribers' | 'creators';
type Priority = 'low' | 'normal' | 'high';

export default function Notifications() {
  const [target, setTarget] = useState<Target>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      setFeedback({ type: 'error', text: 'Title and message are required.' });
      return;
    }

    setSending(true);
    setFeedback(null);

    try {
      const result = await adminService.sendNotification({
        title: title.trim(),
        body: message.trim(),
        target,
        priority,
      });

      setFeedback({
        type: 'success',
        text: `Notification sent successfully to ${result.sent} user${result.sent !== 1 ? 's' : ''}.`,
      });

      // Reset form
      setTarget('all');
      setTitle('');
      setMessage('');
      setPriority('normal');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send notification.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <Bell size={22} className="text-[#10B981]" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Notifications</h1>
        </div>
        <p className="text-white/40 text-sm mt-1">Send mass notifications to users</p>
      </div>

      {/* Send Notification Card */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Send Notification</h2>

        {/* Feedback */}
        {feedback && (
          <div
            className={`text-sm rounded-lg px-4 py-3 mb-5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="space-y-5">
          {/* Target */}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Target Audience</label>
            <div className="flex flex-wrap gap-3">
              {([
                { value: 'all', label: 'All Users' },
                { value: 'subscribers', label: 'Subscribers Only' },
                { value: 'creators', label: 'Creators Only' },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                    target === opt.value
                      ? 'border-[#10B981]/50 bg-[#10B981]/[0.06] text-white'
                      : 'border-white/[0.06] text-white/50 hover:border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="target"
                    value={opt.value}
                    checked={target === opt.value}
                    onChange={() => setTarget(opt.value)}
                    className="accent-[#10B981]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title..."
              className="w-full bg-[#0A0E14] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification message..."
              rows={4}
              className="w-full bg-[#0A0E14] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="bg-[#0A0E14] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Send Button */}
          <div className="pt-1">
            <button
              onClick={handleSend}
              disabled={sending || !title.trim() || !message.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Recent Activity</h2>
        <p className="text-white/30 text-sm">Notification history coming soon</p>
      </div>
    </div>
  );
}
