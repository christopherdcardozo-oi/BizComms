import fs from 'node:fs';
import path from 'node:path';
import { default as EmbeddedPostgres } from 'embedded-postgres';
import pg from 'pg';

const DB_PORT = 54329;
const DB_DIR = path.resolve('./data/db');

async function main() {
  console.log('=== STEP 1: INITIALIZING & STARTING EMBEDDED POSTGRES ===');
  const pgServer = new EmbeddedPostgres({
    port: DB_PORT,
    persistent: true,
  });

  if (!fs.existsSync(DB_DIR)) {
    console.log('Initializing data directory...');
    await pgServer.initialise();
  }

  console.log(`Starting PostgreSQL on port ${DB_PORT}...`);
  await pgServer.start();
  console.log('PostgreSQL started successfully.');

  const client = pgServer.getPgClient();
  await client.connect();
  console.log('Connected to database "postgres" as user "postgres".');

  // Step 2: Apply bootstrap.sql
  console.log('\n=== STEP 2: APPLYING tests/bootstrap.sql ===');
  const bootstrapSql = fs.readFileSync('tests/bootstrap.sql', 'utf8');
  try {
    await client.query(bootstrapSql);
    console.log('tests/bootstrap.sql applied cleanly.');
  } catch (err) {
    console.error('ERROR applying tests/bootstrap.sql:');
    console.error(err);
    await client.end();
    await pgServer.stop();
    process.exit(1);
  }

  // Step 3: Apply Migration
  console.log('\n=== STEP 3: APPLYING MIGRATION ===');
  const migrationPath = 'supabase/migrations/20261019000000_corrected_multi_tenant_schema.sql';
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await client.query(migrationSql);
    console.log('MIGRATION APPLIED CLEANLY WITH ZERO ERRORS!');
  } catch (err) {
    console.error('ERROR applying migration:');
    console.error('Message:', err.message);
    console.error('Code (SQLSTATE):', err.code);
    console.error('Detail:', err.detail);
    console.error('Hint:', err.hint);
    console.error('Position:', err.position);
    console.error('Where:', err.where);
    await client.end();
    await pgServer.stop();
    process.exit(1);
  }

  await client.end();
  await pgServer.stop();
  console.log('\nEmbedded Postgres stopped cleanly.');
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
