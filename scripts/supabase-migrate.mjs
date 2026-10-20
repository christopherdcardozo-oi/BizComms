// Applies supabase/migrations/*.sql, in filename order, to the Postgres at DATABASE_URL.
// Each file runs in its own transaction and is recorded in supabase_migrations.schema_migrations
// (the Supabase CLI's table), so already-applied files are skipped and you can switch to
// `supabase db push` later without re-running anything.
//
// Usage: DATABASE_URL=postgresql://... node scripts/supabase-migrate.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. In Supabase: Project Settings -> Database -> Connection string (URI, session pooler).');
    process.exit(1);
  }

  // Supabase requires TLS. Set SUPABASE_DB_CA to the CA certificate path (downloadable from
  // Project Settings -> Database) to verify the server; otherwise the channel is encrypted
  // but the certificate is not verified.
  const ca = process.env.SUPABASE_DB_CA ? fs.readFileSync(process.env.SUPABASE_DB_CA, 'utf8') : undefined;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new pg.Client({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY,
      statements TEXT[],
      name TEXT
    );
  `);
  const applied = new Set(
    (await client.query('SELECT version FROM supabase_migrations.schema_migrations')).rows.map((r) => r.version)
  );

  const files = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  let ran = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
    if (applied.has(version)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    console.log(`${dryRun ? '  would apply' : '  apply'} ${file}`);
    if (dryRun) continue;
    const sql = fs.readFileSync(path.join('supabase/migrations', file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)', [version, rest.join('_')]);
      await client.query('COMMIT');
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`\nFAILED on ${file}: ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
  console.log(dryRun ? '\nDry run complete.' : `\nDone. Applied ${ran} migration(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
