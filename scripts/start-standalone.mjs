import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function configureDatabase() {
  const file = process.env.DATABASE_URL_FILE;
  if (file === undefined) return;
  if (!file || process.env.DATABASE_URL !== undefined) throw new Error();
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new Error();
    const buffer = Buffer.alloc(4097);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (!size || size > 4096) throw new Error();
    const value = buffer.subarray(0, size).toString('utf8').trim();
    if (!value || /[\r\n\0]/.test(value)) throw new Error();
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
    process.env.DATABASE_URL = value;
  } finally {
    await handle.close();
  }
}

try {
  await configureDatabase();
} catch {
  console.error('Não foi possível carregar a configuração externa do banco.');
  process.exit(1);
}
await import(pathToFileURL(path.join(process.cwd(), 'server.js')).href);
