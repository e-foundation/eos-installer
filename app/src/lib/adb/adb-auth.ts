/**
 * ADB authentication using Web Crypto API.
 *
 * Handles RSA-2048 key generation, token signing, and key storage
 * in browser IndexedDB. Exports public keys in the Android-specific
 * format expected by adbd.
 *
 * Android RSA public key format (serialized struct):
 *   - uint32: key size in 32-bit words (64 for 2048-bit)
 *   - uint32: n0inv (Montgomery parameter: -n^-1 mod 2^32)
 *   - uint8[256]: modulus (little-endian)
 *   - uint8[256]: rr (R^2 mod n, for Montgomery multiplication)
 *   - uint32: exponent (65537)
 *
 * The entire struct is base64-encoded with a trailing " user@host\0".
 */

import { log, logError } from "@e/fastboot";
import {
  ADB_CREDENTIAL_STORE_NAME,
  ADB_CREDENTIAL_DB_VERSION,
} from "./types.js";

const KEY_ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
  hash: "SHA-1",
};

export interface AdbCredentialStore {
  /** Get all stored key pairs for signing */
  getKeys(): Promise<CryptoKeyPair[]>;
  /** Generate a new key pair and store it */
  generateKey(): Promise<CryptoKeyPair>;
}

/**
 * Browser IndexedDB-backed ADB credential store.
 * Stores RSA-2048 key pairs for ADB authentication.
 */
export class BrowserAdbCredentialStore implements AdbCredentialStore {
  private _dbName: string;
  private _db: IDBDatabase | null = null;

  constructor(dbName: string = ADB_CREDENTIAL_STORE_NAME) {
    this._dbName = dbName;
  }

  async getKeys(): Promise<CryptoKeyPair[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readonly");
      const store = tx.objectStore("keys");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async generateKey(): Promise<CryptoKeyPair> {
    const keyPair = await crypto.subtle.generateKey(KEY_ALGORITHM, true, [
      "sign",
    ]);

    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      const req = store.add(keyPair);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    log("Generated and stored new ADB RSA key pair");
    return keyPair;
  }

  private async openDB(): Promise<IDBDatabase> {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, ADB_CREDENTIAL_DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { autoIncrement: true });
        }
      };
      req.onsuccess = (event) => {
        this._db = (event.target as IDBOpenDBRequest).result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * Sign an ADB authentication token with a private key.
 * Returns the PKCS#1 v1.5 signature (256 bytes for RSA-2048).
 */
export async function signToken(
  privateKey: CryptoKey,
  token: Uint8Array,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    token as BufferSource,
  );
  return new Uint8Array(signature);
}

/**
 * Export a public key in the Android ADB RSA format.
 *
 * The Android format is:
 *   base64(struct) + " " + user@host + "\0"
 *
 * Where struct is:
 *   uint32_le  numWords  (64 for 2048-bit)
 *   uint32_le  n0inv     (-n^-1 mod 2^32)
 *   byte[256]  n         (modulus, little-endian)
 *   byte[256]  rr        (R^2 mod n, little-endian)
 *   uint32_le  exponent  (65537)
 */
export async function exportPublicKey(
  publicKey: CryptoKey,
): Promise<Uint8Array> {
  // Export as JWK to get the modulus directly (avoids fragile ASN.1 parsing)
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  if (!jwk.n) {
    throw new Error("JWK export missing modulus (n)");
  }
  const modulusBE = base64urlToUint8Array(jwk.n);

  // Build the Android struct
  const struct = buildAndroidRsaStruct(modulusBE);

  // Base64-encode and add the user@host suffix
  const b64 = uint8ArrayToBase64(struct);
  const suffix = " adb@browser\0";
  const encoder = new TextEncoder();
  const suffixBytes = encoder.encode(suffix);

  const b64Bytes = encoder.encode(b64);
  const result = new Uint8Array(b64Bytes.byteLength + suffixBytes.byteLength);
  result.set(b64Bytes, 0);
  result.set(suffixBytes, b64Bytes.byteLength);

  return result;
}

// ---- Internal Helpers ----

/**
 * Decode a base64url string (as used in JWK) to a Uint8Array.
 */
function base64urlToUint8Array(b64url: string): Uint8Array {
  // base64url → standard base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Build the Android RSA public key struct from a modulus.
 *
 * struct RSAPublicKey {
 *   uint32_t numWords;    // 64 (2048 / 32)
 *   uint32_t n0inv;       // -n^-1 mod 2^32
 *   uint8_t  n[256];      // modulus (little-endian)
 *   uint8_t  rr[256];     // R^2 mod n (little-endian)
 *   uint32_t exponent;    // 65537
 * }
 */
function buildAndroidRsaStruct(modulusBE: Uint8Array): Uint8Array {
  const keySize = 2048;
  const numWords = keySize / 32; // 64

  // Convert modulus from big-endian to little-endian
  const modulusLE = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    modulusLE[i] = modulusBE[255 - i];
  }

  // Compute n0inv: -n^-1 mod 2^32
  const n0inv = computeN0inv(modulusLE);

  // Compute rr: R^2 mod n where R = 2^2048
  const rr = computeRR(modulusBE);

  // Build the struct (4 + 4 + 256 + 256 + 4 = 524 bytes)
  const struct = new Uint8Array(524);
  const view = new DataView(struct.buffer);

  view.setUint32(0, numWords, true);
  view.setUint32(4, n0inv, true);
  struct.set(modulusLE, 8);
  struct.set(rr, 264);
  view.setUint32(520, 65537, true);

  return struct;
}

/**
 * Compute n0inv = -n^-1 mod 2^32.
 * Uses the modulus in little-endian format.
 */
function computeN0inv(modulusLE: Uint8Array): number {
  // Extract lowest 32 bits of n
  const n0 =
    modulusLE[0] |
    (modulusLE[1] << 8) |
    (modulusLE[2] << 16) |
    (modulusLE[3] << 24);

  // Extended Euclidean algorithm for modular inverse mod 2^32
  // Using Newton's method: x = x * (2 - n * x) mod 2^32
  let inv = n0; // n is odd, so n itself is a starting approximation
  for (let i = 0; i < 5; i++) {
    inv = Math.imul(inv, 2 - Math.imul(n0, inv)) | 0;
  }

  // We want -n^-1 mod 2^32
  return (-inv) >>> 0;
}

/**
 * Compute R^2 mod n where R = 2^2048.
 * Returns 256 bytes in little-endian.
 *
 * Uses BigInt for the computation since we need 2048-bit arithmetic.
 */
function computeRR(modulusBE: Uint8Array): Uint8Array {
  // Convert modulus to BigInt
  let n = 0n;
  for (let i = 0; i < modulusBE.byteLength; i++) {
    n = (n << 8n) | BigInt(modulusBE[i]);
  }

  // R = 2^2048
  const r = 1n << 2048n;

  // rr = R^2 mod n
  const rr = (r * r) % n;

  // Convert to 256 bytes little-endian
  const rrBytes = new Uint8Array(256);
  let val = rr;
  for (let i = 0; i < 256; i++) {
    rrBytes[i] = Number(val & 0xffn);
    val >>= 8n;
  }

  return rrBytes;
}

/**
 * Convert a Uint8Array to a base64 string.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Attempt authentication with stored keys, then generate a new key if needed.
 *
 * ADB auth flow:
 *   1. Device sends AUTH TOKEN (20 random bytes)
 *   2. Host signs token with each stored private key, sends AUTH SIGNATURE
 *   3. If no stored key works, generate new key, send AUTH RSAPUBLICKEY
 *   4. User must approve the key on the device screen
 *   5. Device sends CNXN on success
 *
 * @param token - The 20-byte random token from the device
 * @param store - The credential store for key management
 * @param sendSignature - Callback to send AUTH SIGNATURE and check if accepted
 * @param sendPublicKey - Callback to send AUTH RSAPUBLICKEY
 */
export async function authenticate(
  token: Uint8Array,
  store: AdbCredentialStore,
  sendSignature: (signature: Uint8Array) => Promise<boolean>,
  sendPublicKey: (publicKey: Uint8Array) => Promise<void>,
): Promise<void> {
  // Try signing with existing keys
  const keys = await store.getKeys();
  for (const keyPair of keys) {
    try {
      const signature = await signToken(keyPair.privateKey, token);
      const accepted = await sendSignature(signature);
      if (accepted) {
        log("Authenticated with existing key");
        return;
      }
    } catch (e) {
      logError("Key signing failed:", e);
    }
  }

  // No existing key worked — generate a new one
  log("No existing key accepted, generating new key pair...");
  const newKeyPair = await store.generateKey();
  const publicKeyBytes = await exportPublicKey(newKeyPair.publicKey);

  // Send the public key (user must approve on device)
  await sendPublicKey(publicKeyBytes);
  log("Public key sent — waiting for user approval on device");
}
