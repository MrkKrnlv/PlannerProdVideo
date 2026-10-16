// Авторизация: Telegram initData (HMAC WebAppData), персональный ключ, сервисный ключ.
const enc = new TextEncoder();

async function hmac(keyBytes, msg) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function sha256hex(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Проверка initData Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function verifyInitData(initData, botToken, maxAgeSec = 7 * 86400) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = hex(await hmac(secret, check));
  if (!safeEqual(calc, hash)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return user;
  } catch {
    return null;
  }
}

// Секрет вебхука выводится из токена бота: [A-Za-z0-9_-], до 256 символов
export async function webhookSecret(botToken) {
  return (await sha256hex(`planner-webhook:${botToken}`)).slice(0, 48);
}

export function randomKey() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return 'pk_' + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isAllowed(env, userId) {
  const list = String(env.ALLOWED_USERS || '').split(/[\s,]+/).filter(Boolean);
  return !list.length || list.includes(String(userId));
}

export async function ensureUser(db, userId, { name, chatId } = {}) {
  const now = Date.now();
  let u = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(String(userId)).first();
  if (!u) {
    await db.prepare('INSERT OR IGNORE INTO users (user_id, key, name, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(String(userId), randomKey(), name || null, chatId ? String(chatId) : null, now, now).run();
    u = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(String(userId)).first();
  } else if ((name && name !== u.name) || (chatId && String(chatId) !== u.chat_id)) {
    await db.prepare('UPDATE users SET name = COALESCE(?, name), chat_id = COALESCE(?, chat_id), updated_at = ? WHERE user_id = ?')
      .bind(name || null, chatId ? String(chatId) : null, now, String(userId)).run();
    u = { ...u, name: name || u.name, chat_id: chatId ? String(chatId) : u.chat_id };
  }
  return u;
}

// Определяет пользователя запроса. Возвращает строку users или null.
export async function authenticate(request, env) {
  const db = env.DB;
  const svc = request.headers.get('X-Service-Key');
  if (svc) {
    if (!env.SERVICE_KEY || !safeEqual(svc, env.SERVICE_KEY)) return null;
    const uid = request.headers.get('X-Telegram-User-Id');
    if (!uid || !/^\d+$/.test(uid) || !isAllowed(env, uid)) return null;
    return ensureUser(db, uid);
  }
  const auth = request.headers.get('Authorization') || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : request.headers.get('X-Planner-Key');
  if (!key) return null;
  const u = await db.prepare('SELECT * FROM users WHERE key = ?').bind(key).first();
  if (!u || !isAllowed(env, u.user_id)) return null;
  return u;
}
