#!/usr/bin/env node
import crypto from 'crypto';
import { createRequire } from 'module';

// Load dotenv from available location (root or server)
try {
  // eslint-disable-next-line import/no-unresolved
  await import('dotenv/config');
} catch {
  try {
    const require = createRequire(import.meta.url);
    require('../server/node_modules/dotenv/config');
  } catch {
    // continue without dotenv
  }
}

let Pool;
try {
  // Prefer local install
  // eslint-disable-next-line import/no-unresolved
  ({ Pool } = (await import('pg')).default || (await import('pg')));
} catch {
  // Fallback to server package dependency
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ Pool } = require('../server/node_modules/pg'));
}

function usage() {
  console.log(`Usage:
  node tools/license-cli.js generate --customer "Zscaler" --customer-id ORG_UUID --seats 250 --tokens 166000000 --years 1
  node tools/license-cli.js deactivate --license <license_key>
  node tools/license-cli.js extend --license <license_key> --years 1
`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  const opts = {};
  while (args.length) {
    const key = args.shift();
    if (!key.startsWith('--')) continue;
    const val = args.shift();
    opts[key.replace(/^--/, '')] = val;
  }
  return { cmd, opts };
}

function signLicense(customerId, expiresAt, secret) {
  return crypto.createHmac('sha256', secret).update(`${customerId}:${expiresAt}`).digest('hex');
}

async function main() {
  const { cmd, opts } = parseArgs();
  if (!cmd) usage();
  const secret = process.env.LICENSE_SECRET || 'dev-license-secret';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  if (cmd === 'generate') {
    const customerName = opts.customer || 'Customer';
    const customerId = opts['customer-id'] || opts.customer_id || '';
    const seats = Number(opts.seats || 10);
    const tokens = Number(opts.tokens || 10000000);
    const years = Number(opts.years || 1);
    if (!customerId) {
      console.error('customer-id is required');
      process.exit(1);
    }
    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + years);
    const expiresIso = expires.toISOString();
    const signature = signLicense(customerId, expiresIso, secret);
    const licenseKey = `${customerId}:${expiresIso}:${signature}`;
    const { rows } = await pool.query(
      `INSERT INTO licenses (customer_name, customer_id, issued_at, expires_at, max_seats, max_tokens, license_key, active)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, TRUE)
       ON CONFLICT (license_key) DO UPDATE SET customer_name = EXCLUDED.customer_name, customer_id = EXCLUDED.customer_id, expires_at = EXCLUDED.expires_at, max_seats = EXCLUDED.max_seats, max_tokens = EXCLUDED.max_tokens, active = TRUE
       RETURNING *`,
      [customerName, customerId, expiresIso, seats, tokens, licenseKey],
    );
    console.log('License generated:');
    console.log(JSON.stringify(rows[0], null, 2));
    console.log(`license_key: ${licenseKey}`);
  } else if (cmd === 'deactivate') {
    const licenseKey = opts.license;
    if (!licenseKey) {
      console.error('license is required');
      process.exit(1);
    }
    await pool.query(`UPDATE licenses SET active = FALSE WHERE license_key = $1`, [licenseKey]);
    console.log('License deactivated:', licenseKey);
  } else if (cmd === 'extend') {
    const licenseKey = opts.license;
    const years = Number(opts.years || 1);
    if (!licenseKey) {
      console.error('license is required');
      process.exit(1);
    }
    const { rows } = await pool.query(`SELECT * FROM licenses WHERE license_key = $1`, [licenseKey]);
    const license = rows[0];
    if (!license) {
      console.error('License not found');
      process.exit(1);
    }
    const expires = new Date(license.expires_at);
    expires.setFullYear(expires.getFullYear() + years);
    const expiresIso = expires.toISOString();
    const signature = signLicense(license.customer_id, expiresIso, secret);
    const newKey = `${license.customer_id}:${expiresIso}:${signature}`;
    const updated = await pool.query(
      `UPDATE licenses SET expires_at = $1, license_key = $2, active = TRUE WHERE id = $3 RETURNING *`,
      [expiresIso, newKey, license.id],
    );
    console.log('License extended:');
    console.log(JSON.stringify(updated.rows[0], null, 2));
    console.log(`new license_key: ${newKey}`);
  } else {
    usage();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
