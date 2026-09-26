import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Printer, PrinterIcon, X, ArrowLeft } from 'lucide-react';

interface ShopQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShopQrModal({ isOpen, onClose }: ShopQrModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');
  const portalUrl = window.location.origin;

  useEffect(() => {
    QRCode.toDataURL(portalUrl, { width: 320, margin: 2 }, (err, url) => {
      if (!err && url) {
        setQrUrl(url);
      }
    });
  }, [portalUrl]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrintSignage = () => {
    window.print();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
      title="Tap background to close"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative cursor-default"
      >
        {/* Top bar with Back Button and Close icon */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Counter Display Preview */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white mx-auto shadow-xs">
            <Printer className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 tracking-tight">Counter QR Code</h3>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            Place this QR code at your shop counter. Customers scan with their phone camera to submit documents directly.
          </p>
        </div>

        {/* Printable Card */}
        <div className="p-6 bg-zinc-50 border-2 border-dashed border-zinc-300 rounded-2xl text-center space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            QuickPrint Xerox & Digital Press
          </p>
          <h4 className="text-base font-extrabold text-zinc-900">Scan to Print Your Documents</h4>

          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Shop Counter QR Code"
              className="w-48 h-48 mx-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-xs"
            />
          ) : (
            <div className="w-48 h-48 mx-auto bg-zinc-200 animate-pulse rounded-xl" />
          )}

          <div className="space-y-1">
            <p className="text-xs font-semibold text-zinc-800">1. Scan with Phone Camera</p>
            <p className="text-[11px] text-zinc-500">2. Select PDF / Photos & Print Settings</p>
            <p className="text-[11px] text-zinc-500">3. Pay at Counter & Collect Prints</p>
          </div>

          <p className="text-[10px] font-mono text-zinc-400 pt-1">{portalUrl}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <button
            onClick={handlePrintSignage}
            className="flex-1 py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <PrinterIcon className="w-4 h-4" /> Print Counter Sign
          </button>
        </div>
      </div>
    </div>
  );
}
