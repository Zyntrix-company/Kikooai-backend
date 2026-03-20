export default function adminGuard(req, res, next) {
  if (req.user?.is_admin === true) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_ONLY' });
}
