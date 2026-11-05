import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const parseAdminIds = () => new Set(
  (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

export function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;

  params.delete('hash');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const actual = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '');
    if (!Number.isSafeInteger(user.id)) return null;
    return user;
  } catch {
    return null;
  }
}

export function issueSession(user) {
  const admin = parseAdminIds().has(String(user.id));
  return jwt.sign({ telegramId: String(user.id), admin }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function requireSession(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    req.session = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'INVALID_SESSION' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.session?.admin) return res.status(403).json({ error: 'ADMIN_REQUIRED' });
  return next();
}
