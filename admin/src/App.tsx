import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Bots from './pages/Bots';
import Subscriptions from './pages/Subscriptions';
import Exchanges from './pages/Exchanges';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Trades from './pages/Trades';
import Chats from './pages/Chats';
import ShadowSessions from './pages/ShadowSessions';
import Support from './pages/Support';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/bots" element={<Bots />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/shadow-sessions" element={<ShadowSessions />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/exchanges" element={<Exchanges />} />
            <Route path="/support" element={<Support />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
