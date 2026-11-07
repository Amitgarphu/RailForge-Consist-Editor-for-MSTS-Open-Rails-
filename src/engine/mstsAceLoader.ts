/**
 * RailForge Consist - MSTS .ACE Texture Decoder & Three.js Texture Builder
 * @license Apache-2.0
 *
 * Supports uncompressed (SIMISA@@) and zlib-compressed (SIMISA@F) MSTS .ACE files:
 * - 24-bit RGB planar scanlines
 * - 24-bit RGB + 1-bit Transparency mask (ALPHA1)
 * - 32-bit RGBA planar scanlines (8-bit alpha)
 * - DXT1 block-compressed textures (flags & 0x10)
 */

import * as THREE from 'three';
import { decodeSimisaBuffer } from './simisaDecoder';
import { TextureAssetStatus } from '../types/msts';

export interface DecodedAceTexture {
  status: TextureAssetStatus;
  rgbaPixels?: Uint8Array;
  threeTexture?: THREE.DataTexture;
}

/**
 * Decode a single 4x4 DXT1 8-byte block into RGBA pixels
 */
function decodeDxt1Block(
  src: Uint8Array,
  srcOffset: number,
  dst: Uint8Array,
  blockX: number,
  blockY: number,
  width: number,
  height: number
) {
  if (srcOffset + 8 > src.length) return;
  const c0 = src[srcOffset] | (src[srcOffset + 1] << 8);
  const c1 = src[srcOffset + 2] | (src[srcOffset + 3] << 8);

  const r0 = ((c0 >>> 11) & 0x1f) * 255 / 31;
  const g0 = ((c0 >>> 5) & 0x3f) * 255 / 63;
  const b0 = (c0 & 0x1f) * 255 / 31;

  const r1 = ((c1 >>> 11) & 0x1f) * 255 / 31;
  const g1 = ((c1 >>> 5) & 0x3f) * 255 / 63;
  const b1 = (c1 & 0x1f) * 255 / 31;

  const colors = [
    [Math.round(r0), Math.round(g0), Math.round(b0), 255],
    [Math.round(r1), Math.round(g1), Math.round(b1), 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255]
  ];

  if (c0 > c1) {
    colors[2] = [Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3), 255];
    colors[3] = [Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3), 255];
  } else {
    colors[2] = [Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255];
    colors[3] = [0, 0, 0, 0]; // 1-bit transparent black in DXT1a
  }

  const codeBits =
    (src[srcOffset + 4] |
      (src[srcOffset + 5] << 8) |
      (src[srcOffset + 6] << 16) |
      (src[srcOffset + 7] << 24)) >>>
    0;

  for (let py = 0; py < 4; py++) {
    const y = blockY + py;
    if (y >= height) continue;
    for (let px = 0; px < 4; px++) {
      const x = blockX + px;
      if (x >= width) continue;
      const bitIndex = (py * 4 + px) * 2;
      const code = (codeBits >>> bitIndex) & 0x03;
      const dstIdx = (y * width + x) * 4;
      const col = colors[code];
      dst[dstIdx] = col[0];
      dst[dstIdx + 1] = col[1];
      dst[dstIdx + 2] = col[2];
      dst[dstIdx + 3] = col[3];
    }
  }
}

/**
 * Decode an MSTS .ACE binary buffer (either uncompressed SIMISA@@ or compressed SIMISA@F)
 */
export function decodeAceTextureBuffer(
  rawFileBytes: Uint8Array,
  filename: string
): DecodedAceTexture {
  const simisa = decodeSimisaBuffer(rawFileBytes);
  const payload = simisa.binaryPayload || simisa.rawDecompressedBytes;

  if (!simisa.isValidSimisa || !payload || payload.length < 24) {
    return {
      status: {
        filename,
        foundInFolder: true,
        loaded: false,
        format: 'UNSUPPORTED',
        error: simisa.diagnostics.join('; ') || 'Invalid ACE header'
      }
    };
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const version = view.getInt32(0, true);
  if (version !== 1) {
    return {
      status: {
        filename,
        foundInFolder: true,
        loaded: false,
        format: 'UNSUPPORTED',
        error: `Unsupported ACE version (${version})`
      }
    };
  }

  const flags = view.getInt32(4, true);
  const width = view.getInt32(8, true);
  const height = view.getInt32(12, true);
  const surfaceFormat = view.getInt32(16, true);
  const channelCount = view.getInt32(20, true);

  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
    return {
      status: {
        filename,
        foundInFolder: true,
        loaded: false,
        format: 'UNSUPPORTED',
        error: `Invalid ACE dimensions (${width}x${height})`
      }
    };
  }

  // Standard MSTS ACE header has 128 bytes of creator/reserved strings from 20..148 (offset 0x94 = 148)
  const channelStart = payload.length >= 148 + channelCount * 16 ? 148 : 24;
  let hasAlpha8 = false;
  let hasTrans1 = false;

  for (let c = 0; c < channelCount; c++) {
    const chOffset = channelStart + c * 16;
    if (chOffset + 16 <= payload.length) {
      const bitDepth = view.getInt32(chOffset, true);
      const chType = view.getInt32(chOffset + 8, true); // 2=Trans, 3=Red, 4=Green, 5=Blue, 6=Alpha
      if (chType === 6 || bitDepth === 8 && c >= 3) hasAlpha8 = true;
      if (chType === 2 || bitDepth === 1) hasTrans1 = true;
    }
  }

  const isDxt1 = (flags & 0x10) !== 0 || surfaceFormat === 0x12;
  const rgbaPixels = new Uint8Array(width * height * 4);
  rgbaPixels.fill(255);

  const dataAfterChannels = channelStart + channelCount * 16;

  if (isDxt1) {
    // Locate DXT1 blocks (after mipmap offset table if present)
    const isMipmap = (flags & 0x01) !== 0;
    let dxtOffset = dataAfterChannels;
    if (isMipmap && dxtOffset + 4 <= payload.length) {
      const firstOffset = view.getInt32(dxtOffset, true);
      if (firstOffset > 0 && dataAfterChannels + firstOffset < payload.length) {
        dxtOffset = dataAfterChannels + firstOffset + 4; // skip 4-byte mip size prefix
      }
    }
    const blocksX = Math.ceil(width / 4);
    const blocksY = Math.ceil(height / 4);
    let ptr = dxtOffset;
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        decodeDxt1Block(payload, ptr, rgbaPixels, bx * 4, by * 4, width, height);
        ptr += 8;
      }
    }
  } else {
    // Planar scanline format (R, G, B, plus optional 1-bit trans or 8-bit alpha per scanline)
    // Skip scanline offset table (height * 4 bytes for main image) if present
    const transBytesPerLine = hasTrans1 ? Math.ceil(width / 8) : 0;
    const alphaBytesPerLine = hasAlpha8 ? width : 0;
    const bytesPerScanline = width * 3 + transBytesPerLine + alphaBytesPerLine;
    const expectedImageBytes = height * bytesPerScanline;

    let scanStart = dataAfterChannels;
    if (scanStart + height * 4 + expectedImageBytes <= payload.length) {
      scanStart += height * 4;
    }

    for (let y = 0; y < height; y++) {
      const lineOffset = scanStart + y * bytesPerScanline;
      if (lineOffset + width * 3 > payload.length) break;

      const rLine = lineOffset;
      const gLine = rLine + width;
      const bLine = gLine + width;
      let extraLine = bLine + width;

      const transLine = hasTrans1 ? extraLine : -1;
      if (hasTrans1) extraLine += transBytesPerLine;
      const alphaLine = hasAlpha8 ? extraLine : -1;

      for (let x = 0; x < width; x++) {
        const dstIdx = (y * width + x) * 4;
        rgbaPixels[dstIdx] = payload[rLine + x];
        rgbaPixels[dstIdx + 1] = payload[gLine + x];
        rgbaPixels[dstIdx + 2] = payload[bLine + x];

        if (alphaLine >= 0 && alphaLine + x < payload.length) {
          rgbaPixels[dstIdx + 3] = payload[alphaLine + x];
        } else if (transLine >= 0) {
          const byteIdx = transLine + (x >> 3);
          const bitMask = 0x80 >> (x & 7);
          const isOpaque = byteIdx < payload.length ? (payload[byteIdx] & bitMask) !== 0 : true;
          rgbaPixels[dstIdx + 3] = isOpaque ? 255 : 0;
        } else {
          rgbaPixels[dstIdx + 3] = 255;
        }
      }
    }
  }

  const formatLabel: TextureAssetStatus['format'] = isDxt1
    ? 'DXT1'
    : hasAlpha8
    ? 'RGBA32'
    : hasTrans1
    ? 'ALPHA1'
    : 'RGB24';

  const threeTexture = new THREE.DataTexture(rgbaPixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  threeTexture.colorSpace = THREE.SRGBColorSpace;
  threeTexture.wrapS = THREE.RepeatWrapping;
  threeTexture.wrapT = THREE.RepeatWrapping;
  threeTexture.flipY = false;
  threeTexture.needsUpdate = true;

  return {
    status: {
      filename,
      foundInFolder: true,
      loaded: true,
      format: formatLabel,
      width,
      height,
      hasAlpha: hasAlpha8,
      hasTrans: hasTrans1
    },
    rgbaPixels,
    threeTexture
  };
}

/**
 * Helper to build a genuine MSTS .ACE binary buffer (uncompressed or SIMISA@F compressed)
 * for regression testing across RGB24, RGBA32, ALPHA1, and DXT1 formats.
 */
export function buildTestAceBuffer(options: {
  width: number;
  height: number;
  format: 'RGB24' | 'RGBA32' | 'ALPHA1' | 'DXT1';
}): Uint8Array {
  const { width, height, format } = options;
  const isDxt1 = format === 'DXT1';
  const hasAlpha8 = format === 'RGBA32';
  const hasTrans1 = format === 'ALPHA1';

  const channelCount = hasAlpha8 || hasTrans1 ? 4 : 3;
  const transBytes = hasTrans1 ? Math.ceil(width / 8) : 0;
  const alphaBytes = hasAlpha8 ? width : 0;
  const scanlineSize = width * 3 + transBytes + alphaBytes;

  const dxtBlocksX = Math.ceil(width / 4);
  const dxtBlocksY = Math.ceil(height / 4);
  const pixelDataSize = isDxt1 ? dxtBlocksX * dxtBlocksY * 8 : height * 4 + height * scanlineSize;

  const payload = new Uint8Array(148 + channelCount * 16 + pixelDataSize);
  const view = new DataView(payload.buffer);

  view.setInt32(0, 1, true); // version 1
  view.setInt32(4, isDxt1 ? 0x10 : 0x00, true); // flags
  view.setInt32(8, width, true);
  view.setInt32(12, height, true);
  view.setInt32(16, isDxt1 ? 0x12 : 0x0e, true);
  view.setInt32(20, channelCount, true);

  // Channel descriptors at 148
  const chTypes = [3, 4, 5]; // R, G, B
  if (hasTrans1) chTypes.push(2);
  if (hasAlpha8) chTypes.push(6);

  for (let c = 0; c < chTypes.length; c++) {
    const chOff = 148 + c * 16;
    const bitDepth = chTypes[c] === 2 ? 1 : 8;
    view.setInt32(chOff, bitDepth, true);
    view.setInt32(chOff + 8, chTypes[c], true);
  }

  let dataPos = 148 + channelCount * 16;
  if (isDxt1) {
    for (let i = 0; i < dxtBlocksX * dxtBlocksY; i++) {
      view.setUint16(dataPos, 0xf800, true); // Red
      view.setUint16(dataPos + 2, 0x07e0, true); // Green
      view.setUint32(dataPos + 4, 0x55555555, true);
      dataPos += 8;
    }
  } else {
    // Offset table
    for (let y = 0; y < height; y++) {
      view.setInt32(dataPos + y * 4, y * scanlineSize, true);
    }
    dataPos += height * 4;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        payload[dataPos + x] = 180; // R
        payload[dataPos + width + x] = 48; // G
        payload[dataPos + width * 2 + x] = 48; // B
        if (hasAlpha8) {
          payload[dataPos + width * 3 + x] = 220; // A
        }
      }
      if (hasTrans1) {
        for (let tb = 0; tb < transBytes; tb++) {
          payload[dataPos + width * 3 + tb] = 0xff;
        }
      }
      dataPos += scanlineSize;
    }
  }

  // Prepend 16-byte SIMISA@@@@@@@@@@ header
  const full = new Uint8Array(16 + payload.length);
  const hdr = 'SIMISA@@@@@@@@@@';
  for (let i = 0; i < 16; i++) full[i] = hdr.charCodeAt(i);
  full.set(payload, 16);
  return full;
}
