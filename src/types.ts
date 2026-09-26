export type OrderStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CLAIMED'
  | 'PRINTING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED';

export type PaperSize = 'A4' | 'A3' | 'LETTER' | 'LEGAL';
export type ColorMode = 'BW' | 'COLOR';
export type PrintSides = 'SINGLE' | 'DOUBLE';

export interface PrintSettings {
  paperSize: PaperSize;
  colorMode: ColorMode;
  sides: PrintSides;
  copies: number;
  pageRange?: string;
}

export interface PrintFile {
  id: string;
  orderId: string;
  originalFilename: string;
  storageFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  pageCount?: number;
  printSettings: PrintSettings;
  createdAt: string;
}

export interface Order {
  id: string;
  publicOrderId: string;
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

export interface AgentInfo {
  id: string;
  name: string;
  configuredPrinter: string;
  lastHeartbeatAt?: string;
  secondsSinceHeartbeat: number;
  isOnline: boolean;
  currentStatus: 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE';
  printMode: 'windows' | 'mock';
  systemInfo?: Record<string, any>;
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
