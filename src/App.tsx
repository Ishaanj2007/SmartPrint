import React, { useState, useEffect } from 'react';
import { CustomerPortal } from './components/CustomerPortal';
import { AdminDashboard } from './components/AdminDashboard';
import { ShopQrModal } from './components/ShopQrModal';
import { Printer, QrCode, Lock, ArrowLeft } from 'lucide-react';

export default function App() {
  const [isAdminView, setIsAdminView] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Check URL pathname or query for /admin or ?view=admin
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname.startsWith('/admin') || params.get('admin') === 'true') {
      setIsAdminView(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100/60 text-zinc-900 flex flex-col font-sans selection:bg-zinc-900 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-zinc-200 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Shop Brand */}
          <div 
            onClick={() => setIsAdminView(false)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-zinc-900 block leading-tight">
                QuickPrint
              </span>
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                Xerox & Digital Press
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {isAdminView ? (
              <button
                onClick={() => setIsAdminView(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 hover:border-zinc-300 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 transition cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Customer Counter</span>
              </button>
            ) : (
              <>
                {/* Shop Counter QR Signage Button */}
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 hover:border-zinc-300 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 transition cursor-pointer shadow-xs"
                >
                  <QrCode className="w-3.5 h-3.5 text-zinc-900" />
                  <span className="hidden sm:inline">Counter</span> QR
                </button>

                {/* Subtle Staff / Shopkeeper Login Button */}
                <button
                  onClick={() => setIsAdminView(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition cursor-pointer"
                  title="Shopkeeper Admin Login"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Staff</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {isAdminView ? <AdminDashboard /> : <CustomerPortal />}
      </main>

      {/* Counter QR Code Signage Modal */}
      <ShopQrModal isOpen={showQrModal} onClose={() => setShowQrModal(false)} />

      {/* Clean Consumer Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            QuickPrint Xerox & Copy Center • Fast, self-service counter printing
          </p>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span>Pay at counter (Cash / UPI)</span>
            <span>•</span>
            <button
              onClick={() => setIsAdminView(!isAdminView)}
              className="hover:text-zinc-700 underline cursor-pointer"
            >
              {isAdminView ? 'Customer Portal' : 'Staff Login'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
