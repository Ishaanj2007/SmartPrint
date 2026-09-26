import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Eye,
  RefreshCw,
  Lock,
  LogOut,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Check,
  ChevronRight,
  Monitor,
  Wifi,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import { Order, OrderStatus, AgentInfo, AuditLog } from '../types';

export function AdminDashboard() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('xerox_admin_token'));
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Orders and Agent Fleet state
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<string>('PENDING');
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Inspect Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Reject Modal
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Poor document quality / unreadable');

  // Action status message
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch orders and agents
  const fetchData = async () => {
    if (!token) return;
    try {
      // Fetch orders
      const orderRes = await fetch(`/api/admin/orders?status=${activeTab}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (orderRes.status === 401) {
        handleLogout();
        return;
      }
      const orderData = await orderRes.json();
      if (orderData.orders) {
        setOrders(orderData.orders);
        setCounts(orderData.counts || {});
      }

      // Fetch agents
      const agentRes = await fetch('/api/admin/agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const agentData = await agentRes.json();
      if (agentData.agents) {
        setAgents(agentData.agents);
      }
    } catch (err) {
      console.warn('Error fetching admin data:', err);
    }
  };

  useEffect(() => {
    if (token) {
      setIsLoading(true);
      fetchData().finally(() => setIsLoading(false));
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
  }, [token, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      setToken(data.token);
      localStorage.setItem('xerox_admin_token', data.token);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('xerox_admin_token');
  };

  const handleApprove = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionNotice({ type: 'success', text: `Order approved! Job sent to Print Agent.` });
      setTimeout(() => setActionNotice(null), 3000);
      fetchData();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(data.order);
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || 'Failed to approve' });
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleReject = async () => {
    if (!rejectingOrder) return;
    try {
      const res = await fetch(`/api/admin/orders/${rejectingOrder.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRejectingOrder(null);
      setActionNotice({ type: 'success', text: `Order #${rejectingOrder.publicOrderId} rejected.` });
      setTimeout(() => setActionNotice(null), 3000);
      fetchData();
      if (selectedOrder?.id === rejectingOrder.id) {
        setSelectedOrder(data.order);
      }
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || 'Failed to reject' });
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const handleRetry = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActionNotice({ type: 'success', text: `Failed order reset to APPROVED for printing retry.` });
      setTimeout(() => setActionNotice(null), 3000);
      fetchData();
    } catch (err: any) {
      setActionNotice({ type: 'error', text: err.message || 'Failed to retry order' });
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const openInspectModal = async (order: Order) => {
    setSelectedOrder(order);
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.auditLogs) {
        setAuditLogs(data.auditLogs);
      }
    } catch (e) {
      console.warn('Could not fetch audit logs:', e);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // If not logged in, render login screen
  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 shadow-sm">
          <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-white mb-4 mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-center text-zinc-900">Admin Dispatch Console</h2>
          <p className="text-xs text-center text-zinc-500 mt-1 mb-6">
            Log in to review pending print requests and release jobs to the Windows Print Agent.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-zinc-50 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                className="w-full px-3 py-2 text-sm bg-zinc-50 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-sm rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              {isLoggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Log In to Staff Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active Windows Print Agent banner
  const primaryAgent = agents.find((a) => a.id === 'SHOP_001') || agents[0];
  const isAgentOnline = Boolean(primaryAgent?.isOnline);

  const tabOptions = [
    { id: 'PENDING', label: 'Pending', count: counts['PENDING'] || 0, color: 'text-amber-700' },
    { id: 'APPROVED', label: 'Approved', count: counts['APPROVED'] || 0, color: 'text-emerald-700' },
    { id: 'PRINTING', label: 'Printing', count: counts['PRINTING'] || 0, color: 'text-blue-700' },
    { id: 'COMPLETED', label: 'Completed', count: counts['COMPLETED'] || 0, color: 'text-zinc-600' },
    { id: 'REJECTED', label: 'Rejected', count: counts['REJECTED'] || 0, color: 'text-rose-600' },
    { id: 'FAILED', label: 'Failed', count: counts['FAILED'] || 0, color: 'text-amber-800' },
    { id: 'ALL', label: 'All Orders', count: counts['ALL'] || 0, color: 'text-zinc-700' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Bar with Agent Telemetry & Admin controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 text-white rounded-xl">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 leading-tight">Admin Print Queue</h1>
            <p className="text-xs text-zinc-500">Approve or decline customer submissions for Windows printing</p>
          </div>
        </div>

        {/* Live Windows Print Agent Status Card */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              isAgentOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {isAgentOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5" />
                <span>Shop PC Online ({primaryAgent.configuredPrinter})</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <WifiOff className="w-3.5 h-3.5" />
                <span>Shop PC Offline</span>
              </>
            )}
          </div>

          <button
            onClick={fetchData}
            className="p-2 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
            title="Refresh queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="p-2 text-zinc-500 hover:text-rose-600 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Action Notice */}
      {actionNotice && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-xs ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="text-zinc-400 hover:text-zinc-800">
            ✕
          </button>
        </div>
      )}

      {/* Queue Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabOptions.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === tab.id ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Order Queue Grid / Cards */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400 mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-zinc-800">No {activeTab.toLowerCase()} orders right now</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            When customers scan the shop QR code and submit documents, they will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => {
            const firstFile = order.files[0];
            const settings = firstFile?.printSettings;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs flex flex-col justify-between hover:border-zinc-300 transition"
              >
                <div>
                  {/* Top line: ID and Status badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm font-bold text-zinc-900 bg-zinc-100 px-2.5 py-1 rounded-lg">
                      {order.publicOrderId}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        order.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : order.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : order.status === 'PRINTING'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                          : order.status === 'COMPLETED'
                          ? 'bg-zinc-100 text-zinc-800'
                          : order.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  {/* Order Submission Time */}
                  <div className="text-xs text-zinc-500 mb-3">
                    Submitted at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>

                  {/* Files List Summary */}
                  <div className="p-3 bg-zinc-50 rounded-xl mb-3 border border-zinc-150 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Files ({order.files.length})
                    </div>
                    {order.files.slice(0, 2).map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-700 truncate">
                        {file.mimeType.includes('pdf') ? (
                          <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <span className="truncate">{file.originalFilename}</span>
                      </div>
                    ))}
                    {order.files.length > 2 && (
                      <p className="text-[11px] text-zinc-400 italic">+{order.files.length - 2} more file(s)</p>
                    )}
                  </div>

                  {/* Print Settings Tag Summary */}
                  {settings && (
                    <div className="flex flex-wrap gap-1.5 mb-4 text-[11px] font-semibold text-zinc-600">
                      <span className="px-2 py-0.5 bg-zinc-100 rounded-md">{settings.paperSize}</span>
                      <span className="px-2 py-0.5 bg-zinc-100 rounded-md">
                        {settings.colorMode === 'BW' ? 'Black & White' : 'Color'}
                      </span>
                      <span className="px-2 py-0.5 bg-zinc-100 rounded-md">
                        {settings.copies} {settings.copies === 1 ? 'copy' : 'copies'}
                      </span>
                      <span className="px-2 py-0.5 bg-zinc-100 rounded-md">
                        {settings.sides === 'SINGLE' ? 'Single-sided' : 'Double-sided'}
                      </span>
                      {settings.pageRange && settings.pageRange !== 'ALL' && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
                          Pages: {settings.pageRange}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Rejection / Failure notice if applicable */}
                  {order.rejectionReason && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 mb-3">
                      <span className="font-bold">Reason:</span> {order.rejectionReason}
                    </div>
                  )}
                  {order.failureReason && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 mb-3">
                      <span className="font-bold">Error:</span> {order.failureReason}
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-zinc-100 flex items-center gap-2">
                  <button
                    onClick={() => openInspectModal(order)}
                    className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                    title="View documents & preview"
                  >
                    <Eye className="w-4 h-4" /> View
                  </button>

                  {order.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handleApprove(order.id)}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => setRejectingOrder(order)}
                        className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}

                  {order.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetry(order.id)}
                      className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry Job
                    </button>
                  )}

                  {order.status === 'APPROVED' && (
                    <div className="flex-1 text-right text-xs font-semibold text-emerald-700 py-1">
                      Ready for Agent polling...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspect Order & Preview Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Order Inspection</span>
                <h3 className="text-xl font-bold text-zinc-900 font-mono mt-0.5">{selectedOrder.publicOrderId}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl"
              >
                ✕
              </button>
            </div>

            {/* Order Summary */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-50 rounded-2xl text-xs">
              <div>
                <span className="text-zinc-400 block">Submitted Time</span>
                <span className="font-semibold text-zinc-800">
                  {new Date(selectedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Current Status</span>
                <span className="font-bold text-emerald-700">{selectedOrder.status}</span>
              </div>
            </div>

            {/* Files List with Preview / Download Links */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase tracking-wider font-bold text-zinc-500">
                Attached Documents ({selectedOrder.files.length})
              </h4>
              <div className="space-y-3">
                {selectedOrder.files.map((file) => (
                  <div
                    key={file.id}
                    className="p-4 rounded-2xl border border-zinc-200 bg-white space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-zinc-100 text-zinc-700">
                          {file.mimeType.includes('pdf') ? (
                            <FileText className="w-5 h-5 text-rose-500" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-800">{file.originalFilename}</p>
                          <p className="text-[11px] text-zinc-500">
                            {(file.fileSizeBytes / 1024).toFixed(0)} KB • {file.mimeType}
                          </p>
                        </div>
                      </div>

                      <a
                        href={`/api/orders/${selectedOrder.id}/files/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs rounded-xl transition"
                      >
                        Open Raw Document
                      </a>
                    </div>

                    {/* Preview box */}
                    <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                      {file.mimeType.startsWith('image/') ? (
                        <img
                          src={`/api/orders/${selectedOrder.id}/files/${file.id}`}
                          alt="preview"
                          className="max-h-64 object-contain mx-auto rounded-lg"
                        />
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-xs text-zinc-600">PDF Document ready for Windows Print Spooler.</p>
                          <a
                            href={`/api/orders/${selectedOrder.id}/files/${file.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block mt-2 text-xs text-blue-600 hover:underline font-semibold"
                          >
                            Click here to view PDF in browser tab
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Log Timeline */}
            <div className="pt-3 border-t border-zinc-100 space-y-2">
              <h4 className="text-xs uppercase tracking-wider font-bold text-zinc-500">Audit Trail</h4>
              {isLoadingDetails ? (
                <p className="text-xs text-zinc-400">Loading audit log...</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="text-xs text-zinc-600 flex items-start gap-2">
                      <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="font-semibold text-zinc-800">[{log.actorType}]</span>
                      <span className="text-zinc-600">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
              {selectedOrder.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => {
                      setRejectingOrder(selectedOrder);
                    }}
                    className="py-2.5 px-4 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Reject Order
                  </button>
                  <button
                    onClick={() => handleApprove(selectedOrder.id)}
                    className="py-2.5 px-5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                  >
                    Approve Order
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedOrder(null)}
                className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Confirmation Modal */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900">
              Reject Order #{rejectingOrder.publicOrderId}
            </h3>
            <p className="text-xs text-zinc-500">
              Please specify a reason so the customer understands why the print request was declined:
            </p>

            <div className="space-y-2">
              {[
                'Poor document quality / unreadable',
                'Color requested but color printer out of toner',
                'Requested paper size (A3) out of stock',
                'Corrupted file / cannot open',
                'Shop closing / cannot fulfill at this time',
              ].map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                    rejectionReason === reason
                      ? 'border-zinc-900 bg-zinc-50 font-semibold text-zinc-900'
                      : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    checked={rejectionReason === reason}
                    onChange={() => setRejectionReason(reason)}
                    className="text-zinc-900"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Custom reason (optional):</label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRejectingOrder(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-semibold text-zinc-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white cursor-pointer shadow-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
