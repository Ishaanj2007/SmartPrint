import { Request, Response, NextFunction } from 'express';

// Hardcoded or environment configurable admin credentials
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'xerox123';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_secret_token_8899';

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const sessionToken = req.headers['x-admin-token'];

  const token = sessionToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (token === ADMIN_TOKEN) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Unauthorized: Admin authentication required.',
  });
}
