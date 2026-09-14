// Central configuration, read once from the environment.
import path from 'node:path';
import fs from 'node:fs';

const env = process.env;

function bool(v, dflt = false) {
  if (v === undefined || v === '') return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const dataDir = path.resolve(env.DATA_DIR || './data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

export const config = {
  env: env.NODE_ENV || 'production',
  host: env.HOST || '127.0.0.1',
  port: Number(env.PORT || 8080),
  // Public URL, no trailing slash. Used to build the links sent by SMS.
  appUrl: (env.APP_URL || 'http://localhost:8080').replace(/\/+$/, ''),
  appName: env.APP_NAME || 'Surplus',
  dataDir,
  dbPath: path.join(dataDir, 'wps.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  timezone: env.TIMEZONE || 'America/Toronto',
  defaultLang: env.DEFAULT_LANG || 'fr',
  // Secret used to sign cookies and hash login codes. Generated on first run if absent.
  secret: env.APP_SECRET || '',
  // Set when the app sits behind a reverse proxy (it always does in production).
  trustProxy: bool(env.TRUST_PROXY, true),
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID || '',
    authToken: env.TWILIO_AUTH_TOKEN || '',
    from: env.TWILIO_FROM || '',
    // When true, SMS are logged instead of sent. Handy for local testing.
    dryRun: bool(env.SMS_DRY_RUN, false),
  },
  cooldownMinutes: Number(env.COOLDOWN_MINUTES || 15),
  // Absences (lots reserved but never picked up) before a contact is
  // removed from the list automatically.
  strikeLimit: Number(env.STRIKE_LIMIT || 3),
  adminFreshHours: Number(env.ADMIN_FRESH_HOURS || 12),
  sessionDays: Number(env.SESSION_DAYS || 90),
  loginCodeMinutes: 10,
  maxPhotoBytes: 3 * 1024 * 1024,
  maxPhotosPerOffer: 6,
  isHttps() { return this.appUrl.startsWith('https://'); },
};

// Persist an auto-generated secret so sessions survive restarts even when
// APP_SECRET was not provided.
if (!config.secret) {
  const secretFile = path.join(dataDir, '.secret');
  if (fs.existsSync(secretFile)) {
    config.secret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    const { randomBytes } = await import('node:crypto');
    config.secret = randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, config.secret, { mode: 0o600 });
  }
}
