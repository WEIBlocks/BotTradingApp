import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Bot,
  Activity,
  MessageSquare,
  Eye,
  CreditCard,
  ArrowLeftRight,
  Bell,
  LifeBuoy,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/users', label: 'Users', icon: Users },
  { path: '/bots', label: 'Bots', icon: Bot },
  { path: '/trades', label: 'Trades', icon: Activity },
  { path: '/chats', label: 'Chats', icon: MessageSquare },
  { path: '/shadow-sessions', label: 'Shadow Sessions', icon: Eye },
  { path: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { path: '/exchanges', label: 'Exchanges', icon: ArrowLeftRight },
  { path: '/support', label: 'Support', icon: LifeBuoy },
  { path: '/notifications', label: 'Notifications', icon: Bell },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function getPageTitle(pathname: string): string {
  const item = navItems.find((n) => n.path === pathname);
  return item?.label ?? 'Dashboard';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[280px]';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F1117] text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#10B981] flex items-center justify-center font-bold text-sm">
          BT
        </div>
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">BotTrade</span>
            <span className="text-[10px] font-medium bg-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 rounded">
              Admin
            </span>
          </div>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#10B981]/15 text-[#10B981]'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
              title={collapsed && !isMobile ? label : undefined}
            >
              <Icon size={20} className="shrink-0" />
              {(!collapsed || isMobile) && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-white/5 p-3 shrink-0">
        {(!collapsed || isMobile) && user && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center text-xs font-bold shrink-0">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-white/40 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title={collapsed && !isMobile ? 'Logout' : undefined}
        >
          <LogOut size={20} className="shrink-0" />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center h-10 border-t border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0A0E14] text-white overflow-hidden">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside
          className={`${sidebarWidth} shrink-0 transition-all duration-300 ease-in-out border-r border-white/5`}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-[280px] z-50 shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-white/5 bg-[#0F1117]/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Menu size={22} />
              </button>
            )}
            <h1 className="text-lg font-semibold">{getPageTitle(location.pathname)}</h1>
          </div>

          {user && (
            <div className="w-9 h-9 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center text-sm font-bold">
              {getInitials(user.name)}
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
