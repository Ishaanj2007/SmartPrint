import { pgTable, text, timestamp, boolean, integer, jsonb, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (MANDATORY for Cloud SQL with Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  role: text('role').default('USER'), // 'ADMIN' or 'USER'
  createdAt: timestamp('created_at').defaultNow(),
});

// Print Agents table (Persistent store for Windows PC and other counter devices)
export const agents = pgTable('agents', {
  id: text('id').primaryKey(), // e.g. 'SHOP_001'
  name: text('name').notNull(), // 'Counter Main Windows PC'
  token: text('token').notNull(), // 'agent_secret_token_123'
  configuredPrinter: text('configured_printer').notNull(), // 'EPSON L8050 Series'
  isActive: boolean('is_active').default(true).notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  currentStatus: text('current_status').default('IDLE').notNull(), // 'IDLE' | 'PRINTING' | 'ERROR' | 'OFFLINE'
  printMode: text('print_mode').default('windows'), // 'windows' | 'mock'
  systemInfo: jsonb('system_info'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Orders table
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // e.g. 'ord-123456789'
  publicOrderId: text('public_order_id').notNull().unique(), // e.g. 'PS-20260926-001'
  status: text('status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'CLAIMED' | 'PRINTING' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'CANCELLED'
  customerName: text('customer_name').default('Walk-in Customer'),
  customerPhone: text('customer_phone').default(''),
  customerNotes: text('customer_notes').default(''),
  rejectionReason: text('rejection_reason'),
  failureReason: text('failure_reason'),
  totalFiles: integer('total_files').default(1).notNull(),
  claimedByAgent: text('claimed_by_agent').references(() => agents.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Files table (belonging to an order)
export const files = pgTable('files', {
  id: text('id').primaryKey(), // e.g. 'file-123'
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  storageFilename: text('storage_filename').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  pageCount: integer('page_count').default(1).notNull(),
  printSettings: jsonb('print_settings').notNull(), // { paperSize, colorMode, sides, copies, pageRange }
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit Logs table
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  actorType: text('actor_type').notNull(), // 'CUSTOMER' | 'ADMIN' | 'PRINT_AGENT' | 'SYSTEM'
  actorId: text('actor_id'),
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily Order Sequence counter for atomic PS-YYYYMMDD-XXX generation
export const dailySequences = pgTable('daily_sequences', {
  dateStr: text('date_str').primaryKey(), // e.g. '20260926'
  nextSeq: integer('next_seq').default(1).notNull(),
});

// Relationships
export const ordersRelations = relations(orders, ({ many, one }) => ({
  files: many(files),
  agent: one(agents, {
    fields: [orders.claimedByAgent],
    references: [agents.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  order: one(orders, {
    fields: [files.orderId],
    references: [orders.id],
  }),
}));
