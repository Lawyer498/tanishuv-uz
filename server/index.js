import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pg from 'pg';
import { issueSession, requireAdmin, requireSession, verifyTelegramInitData } from './auth.js';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!process.env.BOT_TOKEN || !process.env.JWT_SECRET) {
      return res.status(503).json({ error: 'AUTH_NOT_CONFIGURED' });
    }
    const user = verifyTelegramInitData(
      req.body?.initData,
      process.env.BOT_TOKEN,
      Number(process.env.WEBAPP_MAX_AUTH_AGE_SECONDS ?? 86400),
    );
    if (!user) return res.status(401).json({ error: 'INVALID_TELEGRAM_AUTH' });
    const result = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
       RETURNING id, telegram_id, username, first_name, is_banned`,
      [String(user.id), user.username ?? null, user.first_name ?? ''],
    );
    if (result.rows[0].is_banned) return res.status(403).json({ error: 'USER_BANNED' });
    return res.json({
      token: issueSession(user),
      user: {
        telegramId: String(user.id),
        firstName: user.first_name ?? '',
        isAdmin: process.env.ADMIN_TELEGRAM_IDS?.split(',').map((id) => id.trim()).includes(String(user.id)) ?? false,
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/profile/me', requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.first_name, p.name, p.age, p.gender, p.bio, p.photos, p.region, p.district
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.telegram_id = $1`,
      [req.session.telegramId],
    );
    return res.json({ profile: result.rows[0] ?? null });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/profile/me', requireSession, async (req, res, next) => {
  const { name, age, gender, bio, region, district, photos } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'INVALID_NAME' });
  }
  if (!Number.isInteger(age) || age < 18 || age > 100) return res.status(400).json({ error: 'AGE_RESTRICTION' });
  if (!['male', 'female'].includes(gender)) return res.status(400).json({ error: 'INVALID_GENDER' });
  if (typeof bio !== 'string' || bio.length > 500) return res.status(400).json({ error: 'INVALID_BIO' });
  if (!Array.isArray(photos) || photos.length > 4 || photos.some((photo) => typeof photo !== 'string' || photo.length > 2048)) {
    return res.status(400).json({ error: 'INVALID_PHOTOS' });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('SELECT id FROM users WHERE telegram_id = $1', [req.session.telegramId]);
      if (!user.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'USER_NOT_FOUND' });
      }
      await client.query(
        `INSERT INTO profiles (user_id, name, age, gender, bio, photos, region, district)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, age = EXCLUDED.age,
           gender = EXCLUDED.gender, bio = EXCLUDED.bio, photos = EXCLUDED.photos,
           region = EXCLUDED.region, district = EXCLUDED.district, updated_at = NOW()`,
        [user.rows[0].id, name.trim(), age, gender, bio, photos, region ?? null, district ?? null],
      );
      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/settings', requireSession, requireAdmin, async (_req, res, next) => {
  try {
    const [settings, groups] = await Promise.all([
      pool.query("SELECT key, value FROM app_settings WHERE key IN ('ad_enabled', 'ad_text', 'ad_times')"),
      pool.query('SELECT chat_id, title, chat_type, opted_in_at, enabled, last_ad_sent_at FROM ad_groups ORDER BY opted_in_at DESC'),
    ]);
    const values = Object.fromEntries(settings.rows.map(({ key, value }) => [key, value]));
    return res.json({
      settings: {
        adEnabled: values.ad_enabled === 'true',
        adText: values.ad_text ?? 'Tanishuv UZ — Oʻzbekiston bo‘ylab suhbatdosh toping!',
        adTimes: values.ad_times ?? '11:00,19:00',
        botTokenConfigured: Boolean(process.env.BOT_TOKEN),
        adminIdsConfigured: Boolean(process.env.ADMIN_TELEGRAM_IDS),
      },
      groups: groups.rows,
    });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/admin/settings', requireSession, requireAdmin, async (req, res, next) => {
  const { adEnabled, adText, adTimes } = req.body ?? {};
  if (typeof adEnabled !== 'boolean') return res.status(400).json({ error: 'INVALID_AD_ENABLED' });
  if (typeof adText !== 'string' || adText.trim().length < 1 || adText.length > 1000) {
    return res.status(400).json({ error: 'INVALID_AD_TEXT' });
  }
  if (typeof adTimes !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(,([01]\d|2[0-3]):[0-5]\d)?$/.test(adTimes)) {
    return res.status(400).json({ error: 'INVALID_AD_TIMES' });
  }
  try {
    const entries = [
      ['ad_enabled', String(adEnabled)],
      ['ad_text', adText.trim()],
      ['ad_times', adTimes],
    ];
    await Promise.all(entries.map(([key, value]) => pool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    )));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/admin/groups/:chatId', requireSession, requireAdmin, async (req, res, next) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'INVALID_ENABLED' });
  try {
    const result = await pool.query(
      'UPDATE ad_groups SET enabled = $1 WHERE chat_id = $2 RETURNING chat_id',
      [req.body.enabled, req.params.chatId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'GROUP_NOT_FOUND' });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.message);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Tanishuv UZ API listening on port ${port}`);
  if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is unset; database-backed endpoints will not work.');
});
