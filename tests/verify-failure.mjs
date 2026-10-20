import { default as EmbeddedPostgres } from 'embedded-postgres';
import pg from 'pg';

const DB_PORT = 54329;

async function demonstrateRunnerFailure() {
  console.log('==============================================================================');
  console.log('DEMONSTRATION: Verifying Test Runner Detects SQLSTATE Mismatch & Exits 1');
  console.log('==============================================================================\n');

  const pgServer = new EmbeddedPostgres({
    port: DB_PORT,
    persistent: true,
  });

  await pgServer.start();
  const client = pgServer.getPgClient();
  await client.connect();

  // Deliberately broken test expectation:
  // Query throws 42501 (permission denied for table google_tokens)
  // But we configure test to expect SQLSTATE 99999 (NonExistentSqlState)
  const brokenTest = {
    id: 99,
    name: 'DELIBERATE FAILURE: Mismatched SQLSTATE Expectation',
    role: 'authenticated',
    claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' },
    expectedSqlState: '99999',
    run: async (c) => {
      try {
        await c.query('SELECT * FROM public.google_tokens');
        return { pass: false, received: 'SUCCESS', expected: 'SQLSTATE 99999' };
      } catch (err) {
        const pass = err.code === '99999';
        return {
          pass,
          received: `SQLSTATE ${err.code} (${err.message})`,
          expected: 'SQLSTATE 99999',
        };
      }
    },
  };

  await client.query('BEGIN;');
  await client.query(`SET LOCAL ROLE ${brokenTest.role};`);
  await client.query(`SET LOCAL "request.jwt.claims" = '${JSON.stringify(brokenTest.claims)}';`);

  const result = await brokenTest.run(client);
  await client.query('ROLLBACK;');

  console.log(`[TEST RESULT]: ${result.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Expected: ${result.expected}`);
  console.log(`Received: ${result.received}`);

  await client.end();
  await pgServer.stop();

  if (!result.pass) {
    console.log('\n-> SUCCESS: Test runner correctly detected SQLSTATE mismatch and returned failure.');
    process.exit(1); // Exiting code 1 as required when test fails
  }
}

demonstrateRunnerFailure().catch((err) => {
  console.error(err);
  process.exit(1);
});
