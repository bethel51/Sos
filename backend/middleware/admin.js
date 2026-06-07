function adminMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.replace('Bearer ', '');
  const adminToken = process.env.ADMIN_TOKEN || 'admin_secret_token';
  if (token === adminToken) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access denied' });
}

module.exports = adminMiddleware;
