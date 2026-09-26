import express, { type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { orderRoutes } from './server/routes/orderRoutes.js';
import { adminRoutes } from './server/routes/adminRoutes.js';
import { agentRoutes } from './server/routes/agentRoutes.js';
import { CleanupService } from './server/services/cleanupService.js';
import { db } from './server/database/db.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Body parsing with generous limit for large document uploads / base64 payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS & Preflight support for external Agent & API clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Agent-ID, X-Agent-Token');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

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

// System info endpoint
app.get('/api/system/info', (req: Request, res: Response) => {
  const defaultAgent = db.getAgent('SHOP_001');
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

  res.json({
    shopName: 'QuickPrint Xerox & Digital Press',
    appUrl,
    customerQrUrl: appUrl,
    defaultAgent: {
      id: defaultAgent?.id || 'SHOP_001',
      printer: defaultAgent?.configuredPrinter || 'DEFAULT',
    },
    supportedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
    maxFileSizeMb: 20,
    maxFilesPerOrder: 10,
  });
});

// API Routes
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);

// Start automatic cleanup scheduler (24 hour file retention)
CleanupService.startScheduler();

// Vite integration: serve Vite in dev, or static build in production
async function setupViteOrStatic() {
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[SERVER] Mounted Vite middleware for development');
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
    console.log('[SERVER] Serving static production build from /dist');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` Xerox Print Shop Automation Server running on port ${PORT}`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
  });
}

setupViteOrStatic().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
