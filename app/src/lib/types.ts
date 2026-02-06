/**
 * Shared types, error classes, and enums for the WebUSB device library.
 */

// ---- Error Types ----

export class DeviceError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DeviceError";
    this.cause = cause;
  }
}

export class TimeoutError extends DeviceError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ProtocolError extends DeviceError {
  /** For fastboot FAIL responses or bootloader-specific errors */
  public readonly bootloaderMessage?: string;

  constructor(
    message: string,
    options?: { bootloaderMessage?: string; cause?: unknown },
  ) {
    super(message, options?.cause);
    this.name = "ProtocolError";
    this.bootloaderMessage = options?.bootloaderMessage;
  }
}

export class UsbError extends DeviceError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "UsbError";
  }
}

// ---- Enums ----

export enum DeviceMode {
  ADB = "adb",
  Fastboot = "fastboot",
  Recovery = "recovery",
  Bootloader = "bootloader",
}

export enum LogLevel {
  Silent = 0,
  Error = 1,
  Debug = 2,
}

// ---- Callback Types ----

/** Progress callback: (bytesSent, bytesTotal) */
export type ProgressCallback = (sent: number, total: number) => void;

/** Sideload progress: (blockIndex, totalBlocks) */
export type SideloadProgressCallback = (
  block: number,
  totalBlocks: number,
) => void;

// ---- Device Info ----

export interface DeviceBanner {
  device: string; // codename (e.g., "raven")
  model: string; // model name (e.g., "Pixel 6 Pro")
  product: string; // product name (e.g., "raven")
}

// ---- Logger ----

let currentLogLevel: LogLevel = LogLevel.Silent;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

export function log(...args: unknown[]): void {
  if (currentLogLevel >= LogLevel.Debug) {
    console.log("[lib]", ...args);
  }
}

export function logError(...args: unknown[]): void {
  if (currentLogLevel >= LogLevel.Error) {
    console.error("[lib]", ...args);
  }
}
