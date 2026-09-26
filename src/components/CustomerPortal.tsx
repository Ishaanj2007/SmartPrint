import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Printer,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  QrCode,
  FileQuestion,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Order, OrderStatus, PaperSize, ColorMode, PrintSides, PrintSettings } from '../types';

interface UploadItem {
  file: File;
  previewUrl?: string;
  pageCount?: number;
}

export function CustomerPortal() {
  // Navigation / View state
  const [activePublicId, setActivePublicId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');

  // Upload & Form state
  const [selectedFiles, setSelectedFiles] = useState<UploadItem[]>([]);
  const [settings, setSettings] = useState<PrintSettings>({
    paperSize: 'A4',
    colorMode: 'BW',
    sides: 'SINGLE',
    copies: 1,
    pageRange: 'ALL',
  });
  const [customRangeText, setCustomRangeText] = useState('');
  const [isCustomRange, setIsCustomRange] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active tracked order state
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [orderQrDataUrl, setOrderQrDataUrl] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);

  // Check URL hash or query for initial public order ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get('order');
    if (orderParam) {
      setActivePublicId(orderParam.toUpperCase());
    }
  }, []);

  // Poll active order every 3 seconds for real-time status update
  useEffect(() => {
    if (!activePublicId) {
      setCurrentOrder(null);
      return;
    }

    let isMounted = true;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${activePublicId}`);
        if (!res.ok) {
          if (res.status === 404 && isMounted) {
            setSearchError(`Order '${activePublicId}' was not found.`);
          }
          return;
        }
        const data = await res.json();
        if (isMounted && data.order) {
          setCurrentOrder(data.order);
          setSearchError('');
        }
      } catch (err) {
        console.warn('Error polling order:', err);
      }
    };

    fetchOrder();
    const interval = setInterval(fetchOrder, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activePublicId]);

  // Generate QR code for the order link
  useEffect(() => {
    if (!activePublicId) return;
    const orderUrl = `${window.location.origin}/?order=${activePublicId}`;
    QRCode.toDataURL(orderUrl, { width: 180, margin: 1 }, (err, url) => {
      if (!err && url) {
        setOrderQrDataUrl(url);
      }
    });
  }, [activePublicId]);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    addFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const addFiles = (files: File[]) => {
    setSubmitError('');
    const validFormats = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const maxFiles = 10;
    const maxBytes = 20 * 1024 * 1024;

    const newItems: UploadItem[] = [];

    for (const file of files) {
      if (selectedFiles.length + newItems.length >= maxFiles) {
        setSubmitError(`Maximum ${maxFiles} files allowed per order.`);
        break;
      }

      if (!validFormats.includes(file.type)) {
        setSubmitError(`'${file.name}' is not supported. Please upload PDF, JPG, or PNG.`);
        continue;
      }

      if (file.size > maxBytes) {
        setSubmitError(`'${file.name}' exceeds the 20 MB size limit.`);
        continue;
      }

      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      newItems.push({
        file,
        previewUrl,
        pageCount: file.type === 'application/pdf' ? 1 : 1,
      });
    }

    setSelectedFiles((prev) => [...prev, ...newItems]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setSubmitError('Please select at least one document to print.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const formData = new FormData();
      selectedFiles.forEach((item) => {
        formData.append('files', item.file);
      });

      const effectiveSettings: PrintSettings = {
        paperSize: settings.paperSize,
        colorMode: settings.colorMode,
        sides: settings.sides,
        copies: settings.copies,
        pageRange: isCustomRange ? customRangeText.trim() || 'ALL' : 'ALL',
      };

      formData.append('customerName', 'Walk-in Customer');
      formData.append('defaultSettings', JSON.stringify(effectiveSettings));

      const res = await fetch('/api/orders', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit order');
      }

      // Success: Navigate to status view
      setActivePublicId(data.publicOrderId);
      setCurrentOrder(data.order);
      // Clean up local file previews
      selectedFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      setSelectedFiles([]);
      // Update browser URL query param without full reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('order', data.publicOrderId);
      window.history.pushState({}, '', newUrl);
    } catch (err: any) {
      setSubmitError(err.message || 'Network error submitting print order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyOrderId = () => {
    if (!currentOrder) return;
    navigator.clipboard.writeText(currentOrder.publicOrderId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchError('');
    setActivePublicId(searchQuery.trim().toUpperCase());
  };

  // Render Status Badge and Details
  const renderStatusCard = (order: Order) => {
    const statusConfig: Record<
      OrderStatus,
      { title: string; subtitle: string; color: string; bg: string; border: string; icon: React.ReactNode }
    > = {
      PENDING: {
        title: 'Waiting for Shop Approval',
        subtitle: 'The shopkeeper has received your request and is verifying the print job.',
        color: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: <Clock className="w-7 h-7 text-amber-600 animate-pulse" />,
      },
      APPROVED: {
        title: 'Order Approved!',
        subtitle: 'Approved by counter staff. Sending to printer now.',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: <CheckCircle2 className="w-7 h-7 text-emerald-600" />,
      },
      CLAIMED: {
        title: 'Preparing Document',
        subtitle: 'The printer is preparing your document for printing.',
        color: 'text-indigo-700',
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        icon: <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin" />,
      },
      PRINTING: {
        title: 'Printing in Progress...',
        subtitle: 'Your document is currently printing.',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: <Printer className="w-7 h-7 text-blue-600 animate-bounce" />,
      },
      COMPLETED: {
        title: 'Printing Completed!',
        subtitle: 'Your prints are ready! Please collect them at the shop checkout counter.',
        color: 'text-emerald-800',
        bg: 'bg-emerald-100/70',
        border: 'border-emerald-300',
        icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
      },
      REJECTED: {
        title: 'Request Rejected',
        subtitle: order.rejectionReason || 'The shopkeeper declined this order.',
        color: 'text-rose-700',
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        icon: <XCircle className="w-7 h-7 text-rose-600" />,
      },
      FAILED: {
        title: 'Print Issue Encountered',
        subtitle: order.failureReason || 'A printer spooler issue occurred. The shopkeeper can retry the job.',
        color: 'text-amber-800',
        bg: 'bg-amber-50',
        border: 'border-amber-300',
        icon: <AlertCircle className="w-7 h-7 text-amber-600" />,
      },
      CANCELLED: {
        title: 'Order Cancelled',
        subtitle: 'This order was cancelled.',
        color: 'text-zinc-600',
        bg: 'bg-zinc-50',
        border: 'border-zinc-200',
        icon: <XCircle className="w-7 h-7 text-zinc-500" />,
      },
    };

    const current = statusConfig[order.status];

    // Status step index
    const steps = ['PENDING', 'APPROVED', 'PRINTING', 'COMPLETED'];
    const currentStepIndex = steps.indexOf(order.status === 'CLAIMED' ? 'APPROVED' : order.status);

    return (
      <div className="space-y-5">
        {/* Main Status Alert Box */}
        <div className={`p-5 rounded-2xl border ${current.bg} ${current.border} shadow-sm transition-all`}>
          <div className="flex items-start gap-4">
            <div className="p-2 bg-white rounded-xl shadow-xs shrink-0">{current.icon}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-bold ${current.color}`}>{current.title}</h3>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider bg-white/80 border border-current/20">
                  {order.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-700 leading-relaxed">{current.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Step Indicator (if in normal flow) */}
        {order.status !== 'REJECTED' && order.status !== 'FAILED' && (
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500 mb-2">
              <span>Approval</span>
              <span>Queued</span>
              <span>Printing</span>
              <span>Done</span>
            </div>
            <div className="relative flex items-center justify-between">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-zinc-200 w-full z-0" />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 transition-all duration-500 z-0"
                style={{
                  width: `${
                    order.status === 'COMPLETED'
                      ? 100
                      : order.status === 'PRINTING'
                      ? 66
                      : order.status === 'APPROVED' || order.status === 'CLAIMED'
                      ? 33
                      : 0
                  }%`,
                }}
              />
              {[0, 1, 2, 3].map((stepIdx) => {
                const isPassed = currentStepIndex >= stepIdx;
                const isCurrent = currentStepIndex === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      isPassed
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : isCurrent
                        ? 'bg-white border-emerald-600 text-emerald-600 animate-pulse'
                        : 'bg-white border-zinc-300 text-zinc-400'
                    }`}
                  >
                    {isPassed ? '✓' : stepIdx + 1}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Details & Summary Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Order ID</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-lg font-mono font-bold text-zinc-900">{order.publicOrderId}</span>
                <button
                  onClick={copyOrderId}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
                  title="Copy Order ID"
                >
                  {copiedId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Submitted At</p>
              <p className="text-xs font-medium text-zinc-600 mt-0.5">
                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {/* Files List */}
          <div>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-zinc-400 mb-2">
              Documents to Print ({order.files.length})
            </h4>
            <div className="space-y-2">
              {order.files.map((file, idx) => (
                <div
                  key={file.id || idx}
                  className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-150"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-white rounded-lg border border-zinc-200 text-zinc-600 shrink-0">
                      {file.mimeType.includes('pdf') ? (
                        <FileText className="w-5 h-5 text-rose-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 truncate">{file.originalFilename}</p>
                      <p className="text-xs text-zinc-500">
                        {(file.fileSizeBytes / 1024).toFixed(0)} KB • {file.printSettings.paperSize} •{' '}
                        {file.printSettings.colorMode === 'BW' ? 'B&W' : 'Color'} •{' '}
                        {file.printSettings.copies} {file.printSettings.copies === 1 ? 'copy' : 'copies'} •{' '}
                        {file.printSettings.sides === 'SINGLE' ? 'Single-sided' : 'Double-sided'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* QR Code for Mobile Bookmark */}
          {orderQrDataUrl && (
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-4">
              <div className="text-xs text-zinc-500">
                <p className="font-semibold text-zinc-700">Keep this screen open or scan QR</p>
                <p className="mt-0.5">Scan with another phone to monitor this print order remotely.</p>
              </div>
              <img
                src={orderQrDataUrl}
                alt="Order QR Code"
                className="w-16 h-16 rounded-lg border border-zinc-200 shrink-0 p-1 bg-white"
              />
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setActivePublicId(null);
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('order');
              window.history.pushState({}, '', newUrl);
            }}
            className="flex-1 py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 font-semibold text-zinc-700 text-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Print Another Document
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10">
      {/* Header Banner */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 text-white rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
          <Printer className="w-3.5 h-3.5" /> Self-Service Print Counter
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
          Print your documents
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload PDF or photos, choose paper & copies, pay at counter, and print instantly.
        </p>
      </div>

      {/* Track Existing Order Bar */}
      {!activePublicId && (
        <div className="mb-6 bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Have an Order ID? (e.g. PS-20260926-001)"
              className="flex-1 px-3 py-2 text-sm bg-white rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Track
            </button>
          </form>
          {searchError && <p className="text-xs text-rose-600 mt-1.5 px-1">{searchError}</p>}
        </div>
      )}

      {/* Main View: Status Page vs Upload Form */}
      {activePublicId ? (
        currentOrder ? (
          renderStatusCard(currentOrder)
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center space-y-4">
            <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mx-auto" />
            <h3 className="font-bold text-zinc-800">Checking Order #{activePublicId}...</h3>
            <p className="text-xs text-zinc-500">Retrieving real-time status from shop server...</p>
            {searchError && (
              <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200">
                {searchError}
                <button
                  onClick={() => setActivePublicId(null)}
                  className="block mt-2 underline font-semibold text-rose-800"
                >
                  Return to upload
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        <form onSubmit={handleSubmitOrder} className="space-y-6">
          {/* File Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-300 hover:border-zinc-500 bg-zinc-50/70 hover:bg-zinc-100/60 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handleFileSelection}
              className="hidden"
            />
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-700 group-hover:scale-105 transition-transform shadow-xs">
              <Upload className="w-6 h-6 text-zinc-800" />
            </div>
            <h3 className="text-base font-bold text-zinc-900">Upload Files</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
              Tap to browse or drop documents here. Supports <span className="font-semibold text-zinc-700">PDF, JPG, PNG</span>.
            </p>
            <p className="text-[11px] text-zinc-400 mt-2">Up to 10 files • Max 20 MB each</p>
          </div>

          {/* Uploaded Files Preview List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Selected Documents ({selectedFiles.length}/10)
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="text-xs text-rose-600 hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-2">
                {selectedFiles.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-white rounded-xl border border-zinc-200 shadow-xs"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt="preview"
                          className="w-10 h-10 object-cover rounded-lg border border-zinc-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 truncate">{item.file.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {(item.file.size / 1024).toFixed(0)} KB • {item.file.type.includes('pdf') ? 'PDF' : 'Image'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-zinc-100 transition"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Print Settings Section */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-2">
              <Printer className="w-4 h-4 text-zinc-900" /> Print Settings
            </h3>

            {/* Paper Size, Color Mode & Sides */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Paper Size</label>
                <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 p-1 rounded-xl">
                  {(['A4', 'A3'] as PaperSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, paperSize: size }))}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        settings.paperSize === size
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Color</label>
                <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 p-1 rounded-xl">
                  {[
                    { id: 'BW', label: 'B&W' },
                    { id: 'COLOR', label: 'Color' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, colorMode: mode.id as ColorMode }))}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        settings.colorMode === mode.id
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Sides</label>
                <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 p-1 rounded-xl">
                  {[
                    { id: 'SINGLE', label: 'Single' },
                    { id: 'DOUBLE', label: 'Double' },
                  ].map((side) => (
                    <button
                      key={side.id}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, sides: side.id as PrintSides }))}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        settings.sides === side.id
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {side.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Copies Counter */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Copies (1 - 20) • <span className="font-normal text-zinc-500">{settings.paperSize} paper</span>
              </label>
              <div className="flex items-center bg-zinc-100 p-1 rounded-xl max-w-xs">
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, copies: Math.max(1, s.copies - 1) }))}
                  className="w-10 h-8 flex items-center justify-center font-bold text-zinc-700 bg-white rounded-lg shadow-xs hover:bg-zinc-50 cursor-pointer"
                >
                  -
                </button>
                <span className="flex-1 text-center text-sm font-bold text-zinc-800">
                  {settings.copies}
                </span>
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, copies: Math.min(20, s.copies + 1) }))}
                  className="w-10 h-8 flex items-center justify-center font-bold text-zinc-700 bg-white rounded-lg shadow-xs hover:bg-zinc-50 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Page Range Selection */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Page Range</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setIsCustomRange(false)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border transition cursor-pointer text-left ${
                    !isCustomRange
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  All Pages
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomRange(true)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border transition cursor-pointer text-left ${
                    isCustomRange
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {isCustomRange && (
                <input
                  type="text"
                  value={customRangeText}
                  onChange={(e) => setCustomRangeText(e.target.value)}
                  placeholder="e.g. 1-5, 8, 11-12"
                  className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              )}
            </div>
          </div>

          {/* Submit Error Banner */}
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || selectedFiles.length === 0}
            className="w-full py-4 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-bold text-base transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" /> Submitting Request...
              </>
            ) : (
              <>
                Submit Print Request <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-zinc-400">
            No customer registration required • Pay in cash or UPI at the counter upon pickup
          </p>
        </form>
      )}
    </div>
  );
}
