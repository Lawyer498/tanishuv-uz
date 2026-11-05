import 'dotenv/config';
import cron from 'node-cron';
import pg from 'pg';
import { Markup, Telegraf } from 'telegraf';

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN is required to start the Telegram bot.');
  process.exit(1);
}
if (!process.env.MINI_APP_URL) {
  console.error('MINI_APP_URL must be configured before starting the bot.');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start(async (ctx) => {
  const greeting = [
    'Salom! Xush kelibsiz! 👋',
    '',
    "O‘zbekiston bo‘ylab o‘zingizga yaqin joydan suhbatdosh topish uchun ajoyib tanlov! 🔥",
    'O‘z tumaningiz, viloyatingiz va butun respublika bo‘ylab samimiy suhbatdoshlar bilan tanishing.',
  ].join('\n');
  await ctx.reply(greeting, Markup.inlineKeyboard([
    Markup.button.webApp('🚀 Tanishuv UZ ni ochish', process.env.MINI_APP_URL),
  ]));
});

bot.help((ctx) => ctx.reply(
  'Yordam:\n/start — Mini Appni ochish\n/ads_on — guruh adminlari uchun e’lonlarga rozilik berish\n/ads_off — e’lonlardan voz kechish',
));

async function setAdsOptIn(ctx, enabled) {
  const actorId = ctx.from?.id;
  if (!actorId) return ctx.reply('Buyruq egasini aniqlab bo‘lmadi.');
  const inGroup = ['group', 'supergroup'].includes(ctx.chat.type);
  const target = inGroup ? ctx.chat : ctx.message.text.split(/\s+/)[1];
  if (!inGroup && (ctx.chat.type !== 'private' || !target)) {
    return ctx.reply('Guruhda buyruqni yuboring yoki shaxsiy chatda /ads_on @kanal_manzili deb yozing.');
  }
  const member = await ctx.telegram.getChatMember(inGroup ? ctx.chat.id : target, actorId);
  if (!['administrator', 'creator'].includes(member.status)) {
    return ctx.reply('Rozilikni faqat guruh yoki kanal administratori yoqishi mumkin.');
  }
  if (!inGroup && enabled) {
    const botMember = await ctx.telegram.getChatMember(target, ctx.botInfo.id);
    if (!['administrator', 'creator'].includes(botMember.status)) {
      return ctx.reply('Avval botni kanalga administrator qilib qo‘shing.');
    }
  }
  const chat = inGroup ? ctx.chat : await ctx.telegram.getChat(target);
  if (!['group', 'supergroup', 'channel'].includes(chat.type)) {
    return ctx.reply('Faqat guruh yoki kanalni ulash mumkin.');
  }
  await pool.query(
    `INSERT INTO ad_groups (chat_id, title, chat_type, opted_in_by, enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title,
       chat_type = EXCLUDED.chat_type, opted_in_by = EXCLUDED.opted_in_by,
       opted_in_at = NOW(), enabled = EXCLUDED.enabled`,
    [String(chat.id), chat.title ?? '', chat.type, String(actorId), enabled],
  );
  return ctx.reply(enabled
    ? 'Rozilik saqlandi. Reklama faqat admin panelda yoqilganda yuboriladi.'
    : 'Reklama uchun rozilik bekor qilindi.');
}

bot.command('ads_on', (ctx) => setAdsOptIn(ctx, true));
bot.command('ads_off', (ctx) => setAdsOptIn(ctx, false));

bot.on('my_chat_member', async (ctx) => {
  const chat = ctx.update.my_chat_member.chat;
  const status = ctx.update.my_chat_member.new_chat_member.status;
  if (['left', 'kicked'].includes(status)) {
    await pool.query('UPDATE ad_groups SET enabled = FALSE WHERE chat_id = $1', [String(chat.id)]);
  }
});

function readDailyTimes(value) {
  const times = value.split(',').map((part) => part.trim());
  if (times.length > 2 || times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new Error('Configured ad_times must contain one or two valid HH:mm times.');
  }
  return times;
}

async function sendScheduledAds() {
  const settings = await pool.query(
    "SELECT key, value FROM app_settings WHERE key IN ('ad_enabled', 'ad_text', 'ad_times')",
  );
  const values = Object.fromEntries(settings.rows.map(({ key, value }) => [key, value]));
  if (values.ad_enabled !== 'true') return;
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.AD_TIMEZONE ?? 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  if (!readDailyTimes(values.ad_times ?? '11:00,19:00').includes(now)) return;
  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.AD_TIMEZONE ?? 'Asia/Tashkent',
  }).format(new Date());

  const result = await pool.query('SELECT chat_id FROM ad_groups WHERE enabled = TRUE');
  for (const { chat_id: chatId } of result.rows) {
    const claim = await pool.query(
      `INSERT INTO ad_delivery_log (chat_id, local_day, scheduled_time, status)
       VALUES ($1, $2, $3, 'pending') ON CONFLICT DO NOTHING RETURNING chat_id`,
      [chatId, localDay, now],
    );
    if (!claim.rowCount) continue;
    try {
      await bot.telegram.sendMessage(chatId, values.ad_text ?? 'Tanishuv UZ — suhbatdosh toping!', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Mini Appni ochish', web_app: { url: process.env.MINI_APP_URL } }]],
        },
      });
      await pool.query('UPDATE ad_groups SET last_ad_sent_at = NOW() WHERE chat_id = $1', [chatId]);
      await pool.query(
        "UPDATE ad_delivery_log SET status = 'sent' WHERE chat_id = $1 AND local_day = $2 AND scheduled_time = $3",
        [chatId, localDay, now],
      );
    } catch (error) {
      console.error(`Scheduled ad failed for chat ${chatId}:`, error.message);
      await pool.query(
        "UPDATE ad_delivery_log SET status = 'failed' WHERE chat_id = $1 AND local_day = $2 AND scheduled_time = $3",
        [chatId, localDay, now],
      );
    }
  }
}

cron.schedule('* * * * *', () => {
  sendScheduledAds().catch((error) => console.error('Ad scheduler failed:', error.message));
});

bot.launch().then(() => console.log('Telegram bot started.')).catch((error) => {
  console.error('Telegram bot failed to start:', error.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
