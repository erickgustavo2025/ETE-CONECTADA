import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { utcPostgresUrl } from './database-config';
import { assertPortalDatabaseRole } from './database-runtime-role';

const globalForPrisma = globalThis as typeof globalThis & {
  portalPrisma?: PrismaClient;
};

export function getDb(): PrismaClient {
  if (globalForPrisma.portalPrisma) return globalForPrisma.portalPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('Configure DATABASE_URL para acessar o banco do portal.');
  const adapter = new PrismaPg({
    connectionString: utcPostgresUrl(connectionString, process.env.PGOPTIONS),
    onConnect: assertPortalDatabaseRole,
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 60000,
  });
  const client = new PrismaClient({ adapter });
  globalForPrisma.portalPrisma = client;
  return client;
}

// Fecha também a referência compartilhada para o próximo ciclo de execução.
export async function disconnectDb() {
  const client = globalForPrisma.portalPrisma;
  delete globalForPrisma.portalPrisma;
  await client?.$disconnect();
}
