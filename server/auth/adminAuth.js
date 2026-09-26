const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "xerox123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin_session_secret_token_8899";
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const sessionToken = req.headers["x-admin-token"];
  const token = sessionToken || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (token === ADMIN_TOKEN) {
    next();
    return;
  }
  res.status(401).json({
    error: "Unauthorized: Admin authentication required."
  });
}
export {
  ADMIN_PASSWORD,
  ADMIN_TOKEN,
  ADMIN_USERNAME,
  requireAdminAuth
};
