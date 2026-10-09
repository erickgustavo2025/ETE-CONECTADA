import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** Armazena senha no formato scrypt$<salt hex>$<digest hex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltHex, digestHex, extra] = encoded.split("$");
  if (
    algorithm !== "scrypt" || extra !== undefined ||
    !/^[a-f\d]{32}$/i.test(saltHex ?? "") ||
    !/^[a-f\d]{128}$/i.test(digestHex ?? "")
  ) return false;

  const expected = Buffer.from(digestHex, "hex");
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH)) as Buffer;
  return timingSafeEqual(actual, expected);
}
