import { consumeAccessAttempt } from '../src/lib/access-throttle';
import { openTestEnvironment, reportTestFailure } from './test-environment';

async function main() {
  const identifier = process.argv[2];
  if (!/^ec060-[0-9a-f]{16}$/.test(identifier ?? ''))
    throw new Error('Fixture inválida.');
  const environment = await openTestEnvironment();
  try {
    if (process.argv[3] === 'utc')
      await environment.db.$executeRaw`SET TIME ZONE 'UTC'`;
    else await environment.db.$executeRaw`SET TIME ZONE 'America/Fortaleza'`;
    let allowed = 0;
    for (let n = 0; n < 12; n++) {
      if (
        (await consumeAccessAttempt(environment.db, 'login', identifier))
          .allowed
      )
        allowed++;
    }
    process.stdout.write(JSON.stringify({ allowed }));
  } finally {
    await environment.close();
  }
}
main().catch(reportTestFailure);
