import { useState, useEffect } from 'react';
import { Users, DollarSign, CreditCard, Bot, Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  adminService,
  type DashboardData,
  type RevenueAnalytics,
  type SystemHealth,
} from '../services/admin';

function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  value,
  subtitle,
  loading,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  value: string;
  subtitle: string;
  loading: boolean;
}) {
  return (
    <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider">
            {title}
          </p>
          {loading ? (
            <div className="h-7 w-24 bg-white/5 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-white text-2xl font-bold tracking-tight mt-0.5">
              {value}
            </p>
          )}
          {loading ? (
            <div className="h-4 w-32 bg-white/5 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-white/30 text-xs mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-white/40 text-sm">{label}</span>
      <span className="text-white font-semibold text-sm">{value}</span>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${ok ? 'bg-[#10B981]' : 'bg-red-500'}`}
    />
  );
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchAll() {
      try {
        const [d, r, h] = await Promise.all([
          adminService.getDashboard(),
          adminService.getRevenueAnalytics(),
          adminService.getSystemHealth(),
        ]);
        setDashboard(d);
        setRevenue(r);
        setHealth(h);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const fmtNum = (n: number) => new Intl.NumberFormat('en-US').format(n);

  // Prepare chart data — backend revenue is string, convert to number
  const chartData = (revenue?.monthly ?? []).map((m) => ({
    month: m.month,
    revenue: parseFloat(m.revenue) || 0,
    transactions: m.transactions,
  }));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">Platform overview and analytics</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          iconColor="#0D7FF2"
          iconBg="rgba(13,127,242,0.12)"
          title="Total Users"
          value={dashboard ? fmtNum(dashboard.users.totalUsers) : '0'}
          subtitle={dashboard ? `${dashboard.users.newThisMonth} new this month` : ''}
          loading={loading}
        />
        <StatCard
          icon={DollarSign}
          iconColor="#10B981"
          iconBg="rgba(16,185,129,0.12)"
          title="Total Revenue"
          value={dashboard ? fmt(parseFloat(dashboard.revenue.totalRevenue)) : '$0'}
          subtitle={dashboard ? `${dashboard.revenue.totalTransactions} transactions` : ''}
          loading={loading}
        />
        <StatCard
          icon={CreditCard}
          iconColor="#8B5CF6"
          iconBg="rgba(139,92,246,0.12)"
          title="Active Subscriptions"
          value={dashboard ? fmtNum(dashboard.activeSubscriptions) : '0'}
          subtitle="Current period"
          loading={loading}
        />
        <StatCard
          icon={Bot}
          iconColor="#F59E0B"
          iconBg="rgba(245,158,11,0.12)"
          title="Total Bots"
          value={dashboard ? fmtNum(dashboard.totalBots) : '0'}
          subtitle="On platform"
          loading={loading}
        />
      </div>

      {/* Revenue Chart */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
        <h2 className="text-white font-semibold text-base mb-4">Revenue Overview</h2>
        {loading ? (
          <div className="h-72 bg-white/[0.02] rounded-xl animate-pulse" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1C2333',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: any) => [fmt(Number(value)), 'Revenue']) as any}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-72 flex items-center justify-center">
            <p className="text-white/20 text-sm">No revenue data yet</p>
          </div>
        )}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trade Statistics */}
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-white/40" />
            <h2 className="text-white font-semibold text-base">Trade Statistics</h2>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : dashboard?.trades ? (
            <div>
              <SmallStat label="Total Trades" value={fmtNum(dashboard.trades.totalTrades)} />
              <SmallStat label="Buy Orders" value={fmtNum(dashboard.trades.buyCount)} />
              <SmallStat label="Sell Orders" value={fmtNum(dashboard.trades.sellCount)} />
              <SmallStat label="Paper Trades" value={fmtNum(dashboard.trades.paperCount)} />
              <SmallStat label="Live Trades" value={fmtNum(dashboard.trades.liveCount)} />
            </div>
          ) : (
            <p className="text-white/20 text-sm">No trade data</p>
          )}
        </div>

        {/* User Breakdown */}
        <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-white/40" />
            <h2 className="text-white font-semibold text-base">User Breakdown</h2>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : dashboard?.users ? (
            <div>
              <SmallStat label="Total Users" value={fmtNum(dashboard.users.totalUsers)} />
              <SmallStat label="Active Users" value={fmtNum(dashboard.users.activeUsers)} />
              <SmallStat label="Creators" value={fmtNum(dashboard.users.creatorCount)} />
              <SmallStat label="Admins" value={fmtNum(dashboard.users.adminCount)} />
              <SmallStat label="New This Month" value={fmtNum(dashboard.users.newThisMonth)} />
            </div>
          ) : (
            <p className="text-white/20 text-sm">No user data</p>
          )}
        </div>
      </div>

      {/* System Health */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl p-5">
        <h2 className="text-white font-semibold text-base mb-3">System Health</h2>
        {loading ? (
          <div className="flex gap-6">
            <div className="h-5 w-32 bg-white/5 rounded animate-pulse" />
            <div className="h-5 w-32 bg-white/5 rounded animate-pulse" />
          </div>
        ) : health ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div className="flex items-center text-sm text-white/60">
              <StatusDot ok={health.services.database === 'healthy'} />
              Database: {health.services.database}
            </div>
            <div className="flex items-center text-sm text-white/60">
              <StatusDot ok={health.services.redis === 'healthy'} />
              Redis: {health.services.redis}
            </div>
            <div className="flex items-center text-sm text-white/60">
              <StatusDot ok={health.status === 'healthy'} />
              Overall: {health.status}
            </div>
            <div className="text-sm text-white/30">
              Last check: {new Date(health.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <p className="text-white/20 text-sm">Unable to fetch health data</p>
        )}
      </div>
    </div>
  );
}
