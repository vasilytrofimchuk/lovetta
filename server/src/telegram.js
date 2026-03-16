/**
 * Telegram integration — Mini App auth, bot commands, messaging.
 * Follows soulroom pattern for initData validation.
 */

const crypto = require('crypto');

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'lovetta_bot').trim();
const WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3900').trim();

// -- Bot API helpers --------------------------------------

async function botApi(method, params = {}) {
  if (!BOT_TOKEN) throw new Error('Telegram bot not configured');
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`[telegram] API error (${method}):`, data.description);
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  return botApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

async function setBotWebhook(url) {
  const params = { url };
  if (WEBHOOK_SECRET) params.secret_token = WEBHOOK_SECRET;
  return botApi('setWebhook', params);
}

async function setBotCommands() {
  return botApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Open Lovetta' },
      { command: 'help', description: 'Get help' },
    ],
  });
}

// -- Mini App initData validation -------------------------
// Per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

function validateInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Build data check string (sorted, without hash)
  const entries = [];
  for (const [key, value] of params) {
    if (key !== 'hash') entries.push(`${key}=${value}`);
  }
  entries.sort();
  const dataCheckString = entries.join('\n');

  // HMAC validation
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  // Check auth_date (within 24 hours)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  // Extract user
  try {
    const userStr = params.get('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    if (!user.id) return null;
    return {
      id: user.id,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
      photoUrl: user.photo_url || null,
    };
  } catch {
    return null;
  }
}

// -- Bot update handler -----------------------------------

async function handleBotUpdate(update) {
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text === '/start' || text.startsWith('/start ')) {
      await sendMessage(chatId,
        '💕 <b>Welcome to Lovetta!</b>\n\nYour AI companion is waiting for you.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Open Lovetta', web_app: { url: `${SITE_URL}/my/` } }
            ]],
          },
        }
      );
      return;
    }

    if (text === '/help') {
      await sendMessage(chatId,
        '💕 <b>Lovetta — Your AI Companion</b>\n\n' +
        'Tap the button below to open the app and chat with your companions.\n\n' +
        '/start — Open the app\n' +
        '/help — Show this message'
      );
      return;
    }

    // Any other message — prompt to open the app
    await sendMessage(chatId,
      'Tap the button below to chat with your companion 💕',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Open Lovetta', web_app: { url: `${SITE_URL}/my/` } }
          ]],
        },
      }
    );
  }
}

function verifyWebhookSecret(req) {
  if (!WEBHOOK_SECRET) return true;
  return req.get('X-Telegram-Bot-Api-Secret-Token') === WEBHOOK_SECRET;
}

module.exports = {
  validateInitData,
  sendMessage,
  setBotWebhook,
  setBotCommands,
  handleBotUpdate,
  verifyWebhookSecret,
  BOT_USERNAME,
  BOT_TOKEN,
};
