const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const AUTH_SECRET = process.env.AUTH_SECRET || 'moco-local-development-secret';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS || 12 * 60 * 60 * 1000);
const weakPasswords = new Set(['admin123', 'password', 'password123', 'admin@moco.ai', 'admin@moco ai']);

if (!process.env.AUTH_SECRET) {
  console.warn('AUTH_SECRET is not set. Using local development secret. Set AUTH_SECRET in backend/.env for production.');
} else if (AUTH_SECRET.length < 16) {
  throw new Error('AUTH_SECRET must be at least 16 chars long.');
}

app.use(cors({ origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const users = new Map();
const rateBuckets = new Map();
const failedLogins = new Map();
const promoCodes = {
  MOCOSTANDARD: 'standard',
  MOCOPREMIUM: 'premium',
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  if (hash.length !== computed.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(body)
    .digest('base64url');
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.iat || Date.now() - parsed.iat > TOKEN_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getClientKey(req, suffix = '') {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${suffix}`;
}

function rateLimit({ windowMs, max, keyPrefix }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientKey(req)}`;
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({ message: 'Too many requests. Please wait and try again.' });
    }
    next();
  };
}

function getLoginState(email) {
  const now = Date.now();
  const state = failedLogins.get(email) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - state.firstAt > 15 * 60 * 1000) {
    state.count = 0;
    state.firstAt = now;
    state.lockedUntil = 0;
  }
  return state;
}

function recordLoginFailure(email) {
  const state = getLoginState(email);
  state.count += 1;
  if (state.count >= 5) state.lockedUntil = Date.now() + 15 * 60 * 1000;
  failedLogins.set(email, state);
}

function clearLoginFailures(email) {
  failedLogins.delete(email);
}

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, keyPrefix: 'global' });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, keyPrefix: 'auth' });
app.use(globalLimiter);

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt + 60 * 1000) rateBuckets.delete(key);
  }
  for (const [key, state] of failedLogins.entries()) {
    if (now - state.firstAt > 30 * 60 * 1000 && now > state.lockedUntil) failedLogins.delete(key);
  }
}, 5 * 60 * 1000).unref();

function issueAuthResponse(user) {
  const userSafe = {
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
  };
  const token = signToken({ sub: user.email, iat: Date.now() });
  return { user: userSafe, token };
}

function requireAuth(req, res, next) {
  const raw = req.get('authorization') || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  const parsed = verifyToken(token);
  if (!parsed?.sub) return res.status(401).json({ message: 'Unauthorized.' });
  const user = users.get(parsed.sub.toLowerCase());
  if (!user) return res.status(401).json({ message: 'Unauthorized.' });
  req.user = user;
  next();
}

function seedUsers() {
  const seed = [];

  if (process.env.ADMIN_PASSWORD) {
    if (weakPasswords.has(String(process.env.ADMIN_PASSWORD).toLowerCase())) {
      const msg = 'ADMIN_PASSWORD is a weak/default password. Change it before deployment.';
      if (IS_PRODUCTION) throw new Error(msg);
      console.warn(msg);
    }
    seed.push({
      email: 'admin@moco.ai',
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      name: 'Admin',
      plan: 'premium',
    });
  }

  if (process.env.DEMO_USER_PASSWORD) {
    seed.push({
      email: 'user@moco.ai',
      password: process.env.DEMO_USER_PASSWORD,
      role: 'user',
      name: 'Researcher',
      plan: 'free',
    });
  }

  if (process.env.DEMO_PRO_PASSWORD) {
    seed.push({
      email: 'pro@moco.ai',
      password: process.env.DEMO_PRO_PASSWORD,
      role: 'user',
      name: 'Pro User',
      plan: 'standard',
    });
  }

  for (const item of seed) {
    users.set(item.email.toLowerCase(), {
      email: item.email.toLowerCase(),
      name: item.name,
      role: item.role,
      plan: item.plan,
      passwordHash: hashPassword(item.password),
    });
  }
}

seedUsers();

if (users.size === 0) {
  console.warn('No seeded users configured. Set ADMIN_PASSWORD / DEMO_*_PASSWORD in backend/.env or sign up from UI.');
}

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/signup', authLimiter, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || '').trim();
  const password = String(req.body.password || '');

  if (!name || !email || !role || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  if (users.has(email)) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const user = {
    email,
    name,
    role,
    plan: 'standard',
    passwordHash: hashPassword(password),
  };
  users.set(email, user);
  return res.status(201).json(issueAuthResponse(user));
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const state = getLoginState(email || getClientKey(req, 'anonymous'));
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return res.status(429).json({ message: 'Too many failed login attempts. Try again later.' });
  }

  const user = users.get(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordLoginFailure(email || getClientKey(req, 'anonymous'));
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  clearLoginFailures(email);
  return res.json(issueAuthResponse(user));
});

app.post('/api/auth/google-simulate', authLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const role = String(req.body.role || 'user').trim() || 'user';
  const password = String(req.body.password || '');

  if (!email || !name) {
    return res.status(400).json({ message: 'Invalid Google account payload.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'MOCO password must be at least 8 characters.' });
  }

  let user = users.get(email);
  if (!user) {
    user = {
      email,
      name,
      role,
      plan: 'standard',
      passwordHash: hashPassword(password),
    };
    users.set(email, user);
  } else {
    user.passwordHash = hashPassword(password);
  }

  return res.json(issueAuthResponse(user));
});

app.post('/api/billing/promo', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const plan = promoCodes[code];
  if (!plan) {
    return res.status(400).json({ message: 'Invalid promo code.' });
  }

  req.user.plan = plan;
  return res.json({ user: { email: req.user.email, name: req.user.name, role: req.user.role, plan: req.user.plan } });
});

app.listen(PORT, () => {
  console.log(`MOCO backend listening on http://localhost:${PORT}`);
});
