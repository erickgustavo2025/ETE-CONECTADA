import { getDb, disconnectDb } from '../src/lib/db';
import { consumeAccessAttempt } from '../src/lib/access-throttle';
import { verifyTestDatabase, reportTestFailure } from './test-environment';

async function main() {
  const identifier = process.argv[2];
  if (!/^ec060-[0-9a-f]{16}$/.test(identifier ?? ''))
    throw new Error('Fixture inválida.');
  // Os dois workers participam do cenário criado pelo processo principal.
  await verifyTestDatabase();
  const db = getDb();
  try {
    if (process.argv[3] === 'utc') await db.$executeRaw`SET TIME ZONE 'UTC'`;
    else await db.$executeRaw`SET TIME ZONE 'America/Fortaleza'`;
    let allowed = 0;
    for (let n = 0; n < 12; n++) {
      if ((await consumeAccessAttempt(db, 'login', identifier)).allowed)
        allowed++;
    }
    process.stdout.write(JSON.stringify({ allowed }));
  } finally {
    await disconnectDb();
  }
}
main().catch(reportTestFailure);
