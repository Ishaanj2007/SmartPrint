import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { orderRoutes } from './server/routes/orderRoutes.ts';
import { adminRoutes } from './server/routes/adminRoutes.ts';
import { agentRoutes } from './server/routes/agentRoutes.ts';
import { db } from './server/database/db.ts';
import { CleanupService } from './server/services/cleanupService.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable CORS
app.use(cors());

// Parse JSON and urlencoded payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure essential directories exist
const uploadsDir = path.resolve(process.cwd(), 'uploads');
const spoolDir = path.resolve(process.cwd(), 'spool');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(spoolDir)) fs.mkdirSync(spoolDir, { recursive: true });

// Basic request logger for backend observability
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

// System info endpoint (reads persistent Cloud SQL state)
app.get('/api/system/info', async (req: Request, res: Response) => {
  try {
    const defaultAgent = await db.getAgent('SHOP_001');
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    const lastSeen = defaultAgent?.lastHeartbeatAt ? new Date(defaultAgent.lastHeartbeatAt).getTime() : 0;
    const secondsSinceHeartbeat = Math.round((Date.now() - lastSeen) / 1000);
    const isOnline = defaultAgent ? secondsSinceHeartbeat <= 30 : false;

    res.json({
      shopName: 'QuickPrint Xerox & Digital Press',
      appUrl,
      customerQrUrl: appUrl,
      defaultAgent: {
        id: defaultAgent?.id || 'SHOP_001',
        name: defaultAgent?.name || 'Counter Main Windows PC',
        printer: defaultAgent?.configuredPrinter || 'EPSON L8050 Series',
        isOnline,
        secondsSinceHeartbeat,
        lastHeartbeatAt: defaultAgent?.lastHeartbeatAt || null,
        currentStatus: isOnline ? (defaultAgent?.currentStatus || 'IDLE') : 'OFFLINE',
      },
      supportedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
      maxFileSizeMb: 20,
      maxFilesPerOrder: 10,
    });
  } catch (err: any) {
    console.error('[API] Error in /api/system/info:', err);
    res.status(500).json({ error: 'Failed to retrieve system info' });
  }
});

// API Routes
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);

// Start automatic cleanup scheduler (24 hour file retention)
CleanupService.startScheduler();

// Vite integration: serve static build if present, or Vite in dev
async function setupViteOrStatic() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (hasDist) {
    app.use(express.static(distPath, { index: false }));
    app.use('/assets', express.static(path.join(distPath, 'assets')));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
        return;
      }
      const indexFile = path.join(distPath, 'index.html');
      res.sendFile(indexFile);
    });
    console.log('[SERVER] Serving optimized static production build with compiled Tailwind CSS from /dist');
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[SERVER] Mounted Vite middleware for development');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` Xerox Print Shop Automation Server running on port ${PORT}`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Mode: ${hasDist ? 'Static Production' : 'Vite Dev Middleware'}`);
    console.log(` Database: Persistent Google Cloud SQL (PostgreSQL)`);
    console.log(`=======================================================`);
  });
}

setupViteOrStatic();
