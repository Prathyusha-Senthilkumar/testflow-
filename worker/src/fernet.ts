import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Fernet (https://github.com/fernet/spec), compatible with Python's cryptography.fernet as used by
// backend/app/services/secret_store.py. Key rules match secret_store._explicit_fernet exactly:
// TESTFLOW_SECRET_KEY must itself be a Fernet key (base64 of 32 bytes). There is no fallback to the
// service-role key; the legacy service-role-derived key is only read by scripts/rekey_auth_profiles.py.

export class SecretKeyError extends Error {}
export class DecryptError extends Error {}

const VERSION = 0x80;

export function parseFernetKey(material: string | undefined): Buffer {
  const value = (material || "").trim();
  if (!value) {
    throw new SecretKeyError(
      "TESTFLOW_SECRET_KEY is required for Auth Profile encryption. Configure one stable Fernet key before using Auth Profiles."
    );
  }
  // Python decodes with urlsafe_b64decode, which also tolerates the standard alphabet.
  const key = /^[A-Za-z0-9_\-+/]+={0,2}$/.test(value) ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new SecretKeyError("TESTFLOW_SECRET_KEY must be a valid Fernet key.");
  return key;
}

export function secretKeyFromEnv(): Buffer {
  return parseFernetKey(process.env.TESTFLOW_SECRET_KEY);
}

function toBase64UrlPadded(data: Buffer): string {
  // Python's urlsafe_b64decode requires padding, so keep it.
  return data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

export function fernetDecrypt(token: string, key: Buffer): string {
  const data = Buffer.from(token.trim(), "base64");
  if (data.length < 1 + 8 + 16 + 16 + 32 || data[0] !== VERSION || (data.length - 57) % 16 !== 0) {
    throw new DecryptError("Saved value is not a valid encrypted token.");
  }
  const signed = data.subarray(0, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const expected = createHmac("sha256", key.subarray(0, 16)).update(signed).digest();
  if (!timingSafeEqual(mac, expected)) {
    throw new DecryptError(
      "Saved value could not be decrypted. TESTFLOW_SECRET_KEY must match the key it was saved with."
    );
  }
  const iv = data.subarray(9, 25);
  const decipher = createDecipheriv("aes-128-cbc", key.subarray(16, 32), iv);
  try {
    return Buffer.concat([decipher.update(data.subarray(25, data.length - 32)), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptError("Saved value could not be decrypted.");
  }
}

export function fernetEncrypt(plaintext: string, key: Buffer, now: Date = new Date(), iv: Buffer = randomBytes(16)): string {
  const cipher = createCipheriv("aes-128-cbc", key.subarray(16, 32), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 1000)));
  const signed = Buffer.concat([Buffer.from([VERSION]), timestamp, iv, ciphertext]);
  const mac = createHmac("sha256", key.subarray(0, 16)).update(signed).digest();
  return toBase64UrlPadded(Buffer.concat([signed, mac]));
}

/** JSON helpers matching secret_store.encrypt_mapping / decrypt_mapping (compact separators). */
export function decryptMapping(token: string, key: Buffer): Record<string, unknown> {
  const text = fernetDecrypt(token, key);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DecryptError("Saved value is not valid JSON after decryption.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DecryptError("Saved value has an unexpected shape.");
  }
  return value as Record<string, unknown>;
}

export function encryptMapping(payload: Record<string, unknown>, key: Buffer): string {
  return fernetEncrypt(JSON.stringify(payload), key);
}
