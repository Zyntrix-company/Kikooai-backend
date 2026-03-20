import jwt from 'jsonwebtoken';

export default function auth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.id,
      email: payload.email,
      is_admin: payload.is_admin ?? false,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
}
