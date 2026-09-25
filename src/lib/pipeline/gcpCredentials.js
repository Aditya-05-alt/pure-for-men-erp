import fs from 'node:fs';
import path from 'node:path';

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function unwrapEnvQuotes(s) {
  let v = s.trim();
  while (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function normalizePrivateKey(key) {
  if (typeof key !== 'string') return key;
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

/**
 * Parse a Google service-account JSON string (from .env or a key file).
 */
export function parseServiceAccountJson(raw) {
  let s = unwrapEnvQuotes(stripBom(String(raw ?? '').trim()));
  if (!s) {
    throw new Error('GCP service account JSON is empty.');
  }

  const attempts = [];

  const tryParse = (label, text) => {
    try {
      let value = JSON.parse(text);
      if (typeof value === 'string') {
        value = JSON.parse(value);
      }
      if (!value || typeof value !== 'object') {
        throw new Error('JSON must be an object.');
      }
      value.private_key = normalizePrivateKey(value.private_key);
      if (!value.client_email || !value.private_key) {
        throw new Error('Missing client_email or private_key in service account JSON.');
      }
      return value;
    } catch (err) {
      attempts.push(`${label}: ${err?.message || err}`);
      return null;
    }
  };

  let creds = tryParse('direct', s);
  if (creds) return creds;

  // Literal \n sequences from single-line .env paste
  if (s.includes('\\n')) {
    creds = tryParse('unescaped newlines', s.replace(/\\n/g, '\n'));
    if (creds) return creds;
  }

  // Base64-encoded full JSON (safe for .env — no quote escaping)
  if (!s.startsWith('{')) {
    try {
      const decoded = Buffer.from(s, 'base64').toString('utf8');
      creds = tryParse('base64', decoded);
      if (creds) return creds;
    } catch {
      /* continue */
    }
  }

  throw new Error(
    [
      'Invalid GCP_SERVICE_ACCOUNT_JSON in .env.local.',
      'Use ONE of these:',
      '  1) GCP_SERVICE_ACCOUNT_JSON_PATH=./secrets/gcp-sa.json  (recommended — copy your downloaded key file)',
      '  2) GCP_SERVICE_ACCOUNT_JSON=<paste entire key file as ONE minified line>',
      '  3) GCP_SERVICE_ACCOUNT_JSON=<base64 of the key file>  (run: node scripts/encode-gcp-key.mjs path/to/key.json)',
      'Do not use single-quoted JSON or JavaScript object syntax (unquoted keys).',
      attempts[0] ? `Parse error: ${attempts[0]}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function resolveCredentialsPath(filePath) {
  const trimmed = filePath.trim().replace(/^["']|["']$/g, '');
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.join(process.cwd(), trimmed);
}

/**
 * Load credentials from GCP_SERVICE_ACCOUNT_JSON_PATH or GCP_SERVICE_ACCOUNT_JSON.
 */
export function loadGcpServiceAccountCredentials() {
  const filePath = process.env.GCP_SERVICE_ACCOUNT_JSON_PATH?.trim();
  if (filePath) {
    const abs = resolveCredentialsPath(filePath);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `GCP_SERVICE_ACCOUNT_JSON_PATH file not found: ${abs}`
      );
    }
    return parseServiceAccountJson(fs.readFileSync(abs, 'utf8'));
  }

  const inline = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!inline?.trim()) {
    throw new Error(
      'Missing GCP credentials. Set GCP_SERVICE_ACCOUNT_JSON_PATH (path to .json key) or GCP_SERVICE_ACCOUNT_JSON in .env.local.'
    );
  }

  return parseServiceAccountJson(inline);
}
