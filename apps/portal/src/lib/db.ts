import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as typeof globalThis & { portalPrisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (globalForPrisma.portalPrisma) return globalForPrisma.portalPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Configure DATABASE_URL para acessar o banco do portal.');
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 15000, idleTimeoutMillis: 60000 });
  const client = new PrismaClient({ adapter });
  globalForPrisma.portalPrisma = client;
  return client;
}
