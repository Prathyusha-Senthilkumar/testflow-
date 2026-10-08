import assert from "node:assert/strict";
import { test } from "node:test";
import { DecryptError, SecretKeyError, decryptMapping, encryptMapping, fernetDecrypt, fernetEncrypt, parseFernetKey } from "./fernet.js";

// Same disposable key as CI (.github/workflows/ci.yml). Not a real secret.
const KEY = parseFernetKey("MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=");
// Produced by backend/app/services/secret_store.encrypt_mapping with the key above.
const PYTHON_TOKEN =
  "gAAAAABqxw02nNSYfwerFqhGnvfdwikmFiViz6MpQZ8QCEqXCCI3QyqFfC2xwxQ6XCvl4HMs4wxZuEQI0KcyQD3CZ68rawvCuaGOzXKtvEsBlLxBK4k5gPFCtNhwKLJ6grgz0WN1NhgplkLoPvAeL2DKJACiiMg_oqNBoBVXm9r95CzpvJFeF69KoaMyZEFlkPKNTnUp9T7Y_uAbR-aWz4t_alDK8Sf30Q==";

test("decrypts a token written by Python secret_store", () => {
  assert.deepEqual(decryptMapping(PYTHON_TOKEN, KEY), {
    cookies: [],
    origins: [{ origin: "https://a.test", localStorage: [{ name: "k", value: "v" }] }],
  });
});

test("round-trips and pads base64 so Python can decode it", () => {
  const token = encryptMapping({ username: "u", password: "p" }, KEY);
  assert.ok(token.endsWith("=") || token.length % 4 === 0);
  assert.ok(!/[+/]/.test(token));
  assert.deepEqual(decryptMapping(token, KEY), { username: "u", password: "p" });
});

test("wrong key is an explicit error, not an empty session", () => {
  const other = parseFernetKey(Buffer.alloc(32, 7).toString("base64"));
  assert.throws(() => fernetDecrypt(PYTHON_TOKEN, other), DecryptError);
});

test("tampered token is rejected", () => {
  const token = fernetEncrypt("hello", KEY);
  const bytes = Buffer.from(token, "base64");
  bytes[30] ^= 1;
  assert.throws(() => fernetDecrypt(bytes.toString("base64"), KEY), DecryptError);
});

test("missing or invalid key never falls back to another secret", () => {
  assert.throws(() => parseFernetKey(""), SecretKeyError);
  assert.throws(() => parseFernetKey("not-a-fernet-key"), SecretKeyError);
});
