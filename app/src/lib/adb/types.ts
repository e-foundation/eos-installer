/**
 * ADB protocol type definitions.
 */

/**
 * ADB command codes (as little-endian uint32 from ASCII).
 * The magic field of each packet is command ^ 0xFFFFFFFF.
 */
export enum AdbCommand {
  /** Connection request/response */
  Connect = 0x4e584e43, // "CNXN"
  /** Authentication challenge/response */
  Auth = 0x48545541, // "AUTH"
  /** Open a new stream */
  Open = 0x4e45504f, // "OPEN"
  /** Write data to stream */
  Write = 0x45545257, // "WRTE"
  /** Close stream */
  Close = 0x45534c43, // "CLSE"
  /** Acknowledge / ready for more data */
  Okay = 0x59414b4f, // "OKAY"
}

/** ADB protocol version */
export const ADB_VERSION = 0x01000001;

/** Maximum data payload size (1 MB) */
export const ADB_MAX_PAYLOAD = 0x100000;

/** ADB auth types */
export enum AdbAuthType {
  /** Device sends a random token to sign */
  Token = 1,
  /** Host sends back a signature */
  Signature = 2,
  /** Host sends its RSA public key */
  RsaPublicKey = 3,
}

/** ADB packet header size (24 bytes) */
export const ADB_HEADER_SIZE = 24;

/** Parsed ADB packet */
export interface AdbPacket {
  command: AdbCommand;
  arg0: number;
  arg1: number;
  payload: Uint8Array;
}

/** Default sideload block size (64 KB) */
export const SIDELOAD_MAX_PAYLOAD = 0x10000;

/** IndexedDB store name for ADB credentials */
export const ADB_CREDENTIAL_STORE_NAME = "AdbCredentialStore";

/** IndexedDB database version */
export const ADB_CREDENTIAL_DB_VERSION = 1;
