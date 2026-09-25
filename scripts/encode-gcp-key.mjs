#!/usr/bin/env node
/**
 * Encode a Google service-account JSON file for .env.local (base64).
 *
 * Usage:
 *   node scripts/encode-gcp-key.mjs path/to/your-key.json
 *
 * Add to .env.local (single line, no quotes needed):
 *   GCP_SERVICE_ACCOUNT_JSON=<printed base64>
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/encode-gcp-key.mjs <path-to-key.json>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
JSON.parse(raw); // validate
const b64 = Buffer.from(raw, 'utf8').toString('base64');
console.log('\nAdd this line to .env.local:\n');
console.log(`GCP_SERVICE_ACCOUNT_JSON=${b64}`);
console.log('\nOr use a file path instead:\n');
console.log(`GCP_SERVICE_ACCOUNT_JSON_PATH=${file}`);
console.log('');
