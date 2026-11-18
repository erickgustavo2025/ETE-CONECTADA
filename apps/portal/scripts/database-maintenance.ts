import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { utcPostgresUrl } from '../src/lib/database-config';

// Usado somente por comandos e fixtures que precisam do acesso de manutenção.
export function openMaintenanceDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString: utcPostgresUrl(connectionString, process.env.PGOPTIONS),
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 60000,
  });
  return new PrismaClient({ adapter });
}
