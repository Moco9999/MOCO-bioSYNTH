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

if (!process.env.AUTH_SECRET) {
  console.warn('AUTH_SECRET is not set. Using local development secret. Set AUTH_SECRET in backend/.env for production.');
} else if (AUTH_SECRET.length < 16) {
  throw new Error('AUTH_SECRET must be at least 16 chars long.');
}

app.use(cors({ origin: CLIENT_ORIGIN === '*' ? true : CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

const users = new Map();
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
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

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

app.post('/api/auth/signup', (req, res) => {
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

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = users.get(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  return res.json(issueAuthResponse(user));
});

app.post('/api/auth/google-simulate', (req, res) => {
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
