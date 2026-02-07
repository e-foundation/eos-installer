/**
 * USB filter constants and transport type definitions.
 */

/** ADB interface: vendor class 0xFF, subclass 0x42, protocol 0x01 */
export const ADB_USB_FILTER: USBDeviceFilter = {
  classCode: 0xff,
  subclassCode: 0x42,
  protocolCode: 0x01,
};

/** Fastboot interface: vendor class 0xFF, subclass 0x42, protocol 0x03 */
export const FASTBOOT_USB_FILTER: USBDeviceFilter = {
  classCode: 0xff,
  subclassCode: 0x42,
  protocolCode: 0x03,
};

/** Default timeout for USB operations (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum USB bulk transfer size (16 MB) */
export const MAX_TRANSFER_SIZE = 16 * 1024 * 1024;

export interface EndpointInfo {
  inEndpoint: number;
  outEndpoint: number;
  interfaceNumber: number;
  alternateSetting: number;
}
