import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, X, Crown } from 'lucide-react';
import { adminService, type User, type PaginatedResponse } from '../services/admin';

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    creator: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    user: 'bg-white/[0.06] text-white/50 border-white/10',
  };
  const cls = colors[role] || colors.user;
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border ${cls}`}>
      {role}
    </span>
  );
}

function StatusIndicator({ isActive }: { isActive: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span
        className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#10B981]' : 'bg-red-500'}`}
      />
      <span className={isActive ? 'text-[#10B981]' : 'text-red-400'}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-[#10B981]/15 text-[#10B981] flex items-center justify-center text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

export default function Users() {
  const [data, setData] = useState<PaginatedResponse<User> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [modalMode, setModalMode] = useState<'editRole' | 'deactivate' | null>(null);
  const [newRole, setNewRole] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Subscription modal state
  const [subUser, setSubUser] = useState<User | null>(null);
  const [subTier, setSubTier] = useState('pro');
  const [subDays, setSubDays] = useState(30);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (p: number, s: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getUsers(p, limit, s || undefined);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(page, search);
  }, [page, fetchUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchUsers(1, value);
    }, 400);
  };

  const openEditRole = (user: User) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setModalMode('editRole');
    setModalError('');
    setOpenDropdown(null);
  };

  const openDeactivate = (user: User) => {
    setSelectedUser(user);
    setModalMode('deactivate');
    setModalError('');
    setOpenDropdown(null);
  };

  const closeModal = () => {
    setSelectedUser(null);
    setModalMode(null);
    setModalError('');
  };

  const handleSaveRole = async () => {
    if (!selectedUser) return;
    setModalLoading(true);
    setModalError('');
    try {
      await adminService.updateUser(selectedUser.id, { role: newRole });
      closeModal();
      fetchUsers(page, search);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    setModalLoading(true);
    setModalError('');
    try {
      await adminService.deactivateUser(selectedUser.id);
      closeModal();
      fetchUsers(page, search);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to deactivate user');
    } finally {
      setModalLoading(false);
    }
  };

  const openSubModal = (user: User) => {
    setSubUser(user);
    setSubTier('pro');
    setSubDays(30);
    setSubError('');
    setOpenDropdown(null);
  };

  const closeSubModal = () => {
    setSubUser(null);
    setSubError('');
  };

  const handleGrantSub = async () => {
    if (!subUser) return;
    setSubLoading(true);
    setSubError('');
    try {
      await adminService.grantSubscription(subUser.id, subTier, subDays);
      closeSubModal();
      fetchUsers(page, search);
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Failed to grant subscription');
    } finally {
      setSubLoading(false);
    }
  };

  const handleRevokeSub = async () => {
    if (!subUser) return;
    setSubLoading(true);
    setSubError('');
    try {
      await adminService.revokeSubscription(subUser.id);
      closeSubModal();
      fetchUsers(page, search);
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Failed to revoke subscription');
    } finally {
      setSubLoading(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Users Management</h1>
          <p className="text-white/40 text-sm mt-1">
            {data ? `${data.total} total users` : 'Loading...'}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-[#161B22] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-[#161B22] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                  User
                </th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                  Joined
                </th>
                <th className="text-right text-xs font-medium text-white/40 uppercase tracking-wider px-5 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
                        <div className="space-y-1.5">
                          <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
                          <div className="h-3 w-36 bg-white/5 rounded animate-pulse" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><div className="h-5 w-14 bg-white/5 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-16 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-20 bg-white/5 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-4 w-8 bg-white/5 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : data && data.data.length > 0 ? (
                data.data.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Initials name={user.name} />
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{user.name}</p>
                          <p className="text-white/30 text-xs truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusIndicator isActive={user.isActive} />
                    </td>
                    <td className="px-5 py-3 text-white/40 text-sm">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="relative inline-flex items-center gap-1">
                        <button
                          onClick={() => openSubModal(user)}
                          title="Manage Subscription"
                          className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-400/50 hover:text-amber-400 transition-colors"
                        >
                          <Crown size={16} />
                        </button>
                        <button
                          onClick={() =>
                            setOpenDropdown(openDropdown === user.id ? null : user.id)
                          }
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-colors"
                        >
                          <ChevronDown size={16} />
                        </button>
                        {openDropdown === user.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-[#1C2333] border border-white/10 rounded-lg shadow-xl z-20 py-1">
                            <button
                              onClick={() => openEditRole(user)}
                              className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                              Edit Role
                            </button>
                            <button
                              onClick={() => openDeactivate(user)}
                              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            >
                              Deactivate
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-white/20 text-sm">
                    {search ? 'No users match your search' : 'No users found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <span className="text-white/30 text-sm">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Close dropdown on outside click */}
      {openDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />
      )}

      {/* Edit Role Modal */}
      {modalMode === 'editRole' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg">Edit Role</h3>
              <button
                onClick={closeModal}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-white/40 text-sm mb-4">
              Change role for <span className="text-white font-medium">{selectedUser.name}</span>
            </p>

            {modalError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {modalError}
              </div>
            )}

            <div className="space-y-2 mb-6">
              {['user', 'creator', 'admin'].map((role) => (
                <label
                  key={role}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    newRole === role
                      ? 'border-[#10B981]/50 bg-[#10B981]/[0.06]'
                      : 'border-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={newRole === role}
                    onChange={() => setNewRole(role)}
                    className="accent-[#10B981]"
                  />
                  <span className="text-white text-sm font-medium capitalize">{role}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={modalLoading || newRole === selectedUser.role}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {modalLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {modalMode === 'deactivate' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg">Deactivate User</h3>
              <button
                onClick={closeModal}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-white/50 text-sm mb-2">
              Are you sure you want to deactivate this user?
            </p>
            <p className="text-white font-medium text-sm mb-1">{selectedUser.name}</p>
            <p className="text-white/30 text-xs mb-5">{selectedUser.email}</p>

            {modalError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {modalError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={modalLoading}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {modalLoading ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Management Modal */}
      {subUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeSubModal} />
          <div className="relative bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <Crown size={18} className="text-amber-400" />
                Manage Subscription
              </h3>
              <button
                onClick={closeSubModal}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-white/40 text-sm mb-4">
              Subscription for <span className="text-white font-medium">{subUser.name}</span>
            </p>

            {subError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
                {subError}
              </div>
            )}

            {/* Plan tier */}
            <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">Plan Tier</label>
            <select
              value={subTier}
              onChange={(e) => setSubTier(e.target.value)}
              className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm mb-4 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>

            {/* Duration */}
            <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">Duration (days)</label>
            <input
              type="number"
              min={1}
              value={subDays}
              onChange={(e) => setSubDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-[#0D1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm mb-6 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/30 transition-colors"
            />

            <div className="flex flex-col gap-2">
              <button
                onClick={handleGrantSub}
                disabled={subLoading}
                className="w-full px-4 py-2.5 text-sm rounded-lg bg-[#10B981] hover:bg-[#0EA472] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {subLoading ? 'Processing...' : 'Grant Subscription'}
              </button>
              <button
                onClick={handleRevokeSub}
                disabled={subLoading}
                className="w-full px-4 py-2.5 text-sm rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {subLoading ? 'Processing...' : 'Revoke Subscription'}
              </button>
              <button
                onClick={closeSubModal}
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
