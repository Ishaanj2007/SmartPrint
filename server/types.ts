export type OrderStatus =
  | 'PENDING'    // Customer submitted, waiting for shopkeeper approval
  | 'APPROVED'   // Shopkeeper approved, waiting for Python Print Agent
  | 'CLAIMED'    // Python Agent atomically claimed this order
  | 'PRINTING'   // Print Agent sent job to Windows Print Spooler
  | 'COMPLETED'  // Document successfully spooled & printed
  | 'REJECTED'   // Shopkeeper rejected
  | 'FAILED'     // Agent encountered print error (allows admin retry)
  | 'CANCELLED'; // Cancelled

export type PaperSize = 'A4' | 'A3' | 'LETTER' | 'LEGAL';
export type ColorMode = 'BW' | 'COLOR';
export type PrintSides = 'SINGLE' | 'DOUBLE';

export interface PrintSettings {
  paperSize: PaperSize;
  colorMode: ColorMode;
  sides: PrintSides;
  copies: number;
  pageRange?: string; // "ALL" or "1-5, 8"
}

export interface PrintFile {
  id: string;
  orderId: string;
  originalFilename: string;
  storageFilename: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount?: number;
  printSettings: PrintSettings;
  createdAt: string;
}

export interface Order {
  id: string;
  publicOrderId: string; // e.g. PS-20260926-001
  status: OrderStatus;
  customerName?: string;
  customerPhone?: string;
  customerNotes?: string;
  rejectionReason?: string;
  failureReason?: string;
  totalFiles: number;
  claimedByAgent?: string;
  files: PrintFile[];
  createdAt: string;
  updatedAt: string;
}

export interface PrintAgent {
  id: string; // e.g. SHOP_001
  name: string;
  token: string;
  configuredPrinter: string;
  isActive: boolean;
  lastHeartbeatAt?: string;
  currentStatus: 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE';
  printMode?: 'windows' | 'mock';
  systemInfo?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  orderId: string;
  previousStatus?: OrderStatus;
  newStatus: OrderStatus;
  actorType: 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM';
  actorId?: string;
  message?: string;
  createdAt: string;
}
