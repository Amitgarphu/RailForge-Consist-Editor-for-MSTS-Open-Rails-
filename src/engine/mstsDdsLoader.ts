/**
 * RailForge Consist - Open Rails .DDS Texture Decoder (DXT1, DXT3, DXT5 & Uncompressed)
 * @license Apache-2.0
 *
 * Implements complete DirectDraw Surface (.DDS) parsing and software decompression to RGBA8
 * with full mipmap chain extraction, alpha/transparency detection, and sRGB color space preservation.
 */

import * as THREE from 'three';
import { TextureAssetStatus } from '../types/msts';

export interface DecodedDdsTexture {
  status: TextureAssetStatus;
  rgbaPixels?: Uint8Array;
  mipmaps?: Array<{ data: Uint8Array; width: number; height: number }>;
  threeTexture?: THREE.DataTexture;
}

const DDS_MAGIC = 0x20534444; // "DDS "
const DDPF_ALPHAPIXELS = 0x00000001;
const DDPF_FOURCC = 0x00000004;
const DDPF_RGB = 0x00000040;

/**
 * Decode RGB565 color table for a 4x4 DXT block
 */
function unpackDxtColors(
  src: Uint8Array,
  colorOffset: number,
  isDxt1Mode: boolean
): { colors: number[][]; has1BitTrans: boolean } {
  const c0 = src[colorOffset] | (src[colorOffset + 1] << 8);
  const c1 = src[colorOffset + 2] | (src[colorOffset + 3] << 8);

  const r0 = Math.round(((c0 >>> 11) & 0x1f) * (255 / 31));
  const g0 = Math.round(((c0 >>> 5) & 0x3f) * (255 / 63));
  const b0 = Math.round((c0 & 0x1f) * (255 / 31));

  const r1 = Math.round(((c1 >>> 11) & 0x1f) * (255 / 31));
  const g1 = Math.round(((c1 >>> 5) & 0x3f) * (255 / 63));
  const b1 = Math.round((c1 & 0x1f) * (255 / 31));

  const colors = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255]
  ];

  let has1BitTrans = false;
  if (!isDxt1Mode || c0 > c1) {
    colors[2] = [Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3), 255];
    colors[3] = [Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3), 255];
  } else {
    colors[2] = [Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255];
    colors[3] = [0, 0, 0, 0]; // DXT1 1-bit transparent texel
    has1BitTrans = true;
  }

  return { colors, has1BitTrans };
}

/**
 * Decode a single mipmap level of DXT1, DXT3, or DXT5 into RGBA8
 */
function decodeDxtLevel(
  src: Uint8Array,
  srcOffset: number,
  width: number,
  height: number,
  fourCC: 'DXT1' | 'DXT3' | 'DXT5'
): { rgba: Uint8Array; bytesConsumed: number; hasAlpha: boolean; hasTrans: boolean } {
  const blocksX = Math.max(1, Math.ceil(width / 4));
  const blocksY = Math.max(1, Math.ceil(height / 4));
  const blockSize = fourCC === 'DXT1' ? 8 : 16;
  const rgba = new Uint8Array(width * height * 4);

  let ptr = srcOffset;
  let hasAlpha = false;
  let hasTrans = false;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (ptr + blockSize > src.length) break;

      const colorOffset = fourCC === 'DXT1' ? ptr : ptr + 8;
      const { colors } = unpackDxtColors(src, colorOffset, fourCC === 'DXT1');
      const colorBits =
        (src[colorOffset + 4] |
          (src[colorOffset + 5] << 8) |
          (src[colorOffset + 6] << 16) |
          (src[colorOffset + 7] << 24)) >>>
        0;

      // Prepare alpha values for the 16 texels in this 4x4 block
      const blockAlphas = new Uint8Array(16);
      if (fourCC === 'DXT1') {
        blockAlphas.fill(255);
      } else if (fourCC === 'DXT3') {
        // 8 bytes of explicit 4-bit alpha (2 texels per byte)
        for (let i = 0; i < 8; i++) {
          const byte = src[ptr + i];
          const a0 = (byte & 0x0f) * 17;
          const a1 = ((byte >>> 4) & 0x0f) * 17;
          blockAlphas[i * 2] = a0;
          blockAlphas[i * 2 + 1] = a1;
          if (a0 < 255 || a1 < 255) hasAlpha = true;
        }
      } else if (fourCC === 'DXT5') {
        // 2 endpoint bytes + 6 bytes (48 bits) of 3-bit alpha indices
        const alpha0 = src[ptr];
        const alpha1 = src[ptr + 1];
        const alphaLut = new Uint8Array(8);
        alphaLut[0] = alpha0;
        alphaLut[1] = alpha1;
        if (alpha0 > alpha1) {
          alphaLut[2] = Math.round((6 * alpha0 + 1 * alpha1) / 7);
          alphaLut[3] = Math.round((5 * alpha0 + 2 * alpha1) / 7);
          alphaLut[4] = Math.round((4 * alpha0 + 3 * alpha1) / 7);
          alphaLut[5] = Math.round((3 * alpha0 + 4 * alpha1) / 7);
          alphaLut[6] = Math.round((2 * alpha0 + 5 * alpha1) / 7);
          alphaLut[7] = Math.round((1 * alpha0 + 6 * alpha1) / 7);
        } else {
          alphaLut[2] = Math.round((4 * alpha0 + 1 * alpha1) / 5);
          alphaLut[3] = Math.round((3 * alpha0 + 2 * alpha1) / 5);
          alphaLut[4] = Math.round((2 * alpha0 + 3 * alpha1) / 5);
          alphaLut[5] = Math.round((1 * alpha0 + 4 * alpha1) / 5);
          alphaLut[6] = 0;
          alphaLut[7] = 255;
        }

        // First 24 bits (8 texels) from bytes 2..4
        const bits0 = src[ptr + 2] | (src[ptr + 3] << 8) | (src[ptr + 4] << 16);
        for (let i = 0; i < 8; i++) {
          const code = (bits0 >>> (i * 3)) & 0x07;
          const a = alphaLut[code];
          blockAlphas[i] = a;
          if (a < 255) hasAlpha = true;
        }
        // Next 24 bits (8 texels) from bytes 5..7
        const bits1 = src[ptr + 5] | (src[ptr + 6] << 8) | (src[ptr + 7] << 16);
        for (let i = 0; i < 8; i++) {
          const code = (bits1 >>> (i * 3)) & 0x07;
          const a = alphaLut[code];
          blockAlphas[8 + i] = a;
          if (a < 255) hasAlpha = true;
        }
      }

      // Write 4x4 texels
      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) continue;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) continue;
          const texelIdx = py * 4 + px;
          const colorCode = (colorBits >>> (texelIdx * 2)) & 0x03;
          const col = colors[colorCode];
          const dstIdx = (y * width + x) * 4;

          rgba[dstIdx] = col[0];
          rgba[dstIdx + 1] = col[1];
          rgba[dstIdx + 2] = col[2];

          if (fourCC === 'DXT1') {
            rgba[dstIdx + 3] = col[3];
            if (col[3] === 0) hasTrans = true;
          } else {
            rgba[dstIdx + 3] = blockAlphas[texelIdx];
          }
        }
      }

      ptr += blockSize;
    }
  }

  return {
    rgba,
    bytesConsumed: blocksX * blocksY * blockSize,
    hasAlpha,
    hasTrans
  };
}

/**
 * Decode a .DDS texture buffer (DXT1, DXT3, DXT5, or uncompressed RGB/RGBA)
 */
export function decodeDdsTextureBuffer(
  rawBytes: Uint8Array,
  referencedFilename: string,
  resolvedFilename?: string,
  resolutionMethod?: TextureAssetStatus['resolutionMethod']
): DecodedDdsTexture {
  const actualFile = resolvedFilename || referencedFilename;

  if (rawBytes.length < 128) {
    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: false,
        diagnosticState: 'invalid_texture',
        containerType: 'DDS',
        format: 'UNSUPPORTED_DDS',
        error: `Truncated DDS file (${rawBytes.length} bytes < 128 byte header)`
      }
    };
  }

  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== DDS_MAGIC) {
    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: false,
        diagnosticState: 'invalid_texture',
        containerType: 'DDS',
        format: 'UNSUPPORTED_DDS',
        error: 'Invalid DDS magic signature (expected "DDS ")'
      }
    };
  }

  const headerSize = view.getUint32(4, true);
  if (headerSize !== 124) {
    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: false,
        diagnosticState: 'invalid_texture',
        containerType: 'DDS',
        format: 'UNSUPPORTED_DDS',
        error: `Invalid DDS_HEADER size (${headerSize}, expected 124)`
      }
    };
  }

  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const mipMapCount = Math.max(1, view.getUint32(28, true));

  if (width === 0 || height === 0 || width > 16384 || height > 16384) {
    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: false,
        diagnosticState: 'invalid_texture',
        containerType: 'DDS',
        format: 'UNSUPPORTED_DDS',
        error: `Invalid DDS dimensions (${width}x${height})`
      }
    };
  }

  // DDS_PIXELFORMAT starts at byte offset 76
  const pfFlags = view.getUint32(80, true);
  const fourCCStr = String.fromCharCode(
    rawBytes[84],
    rawBytes[85],
    rawBytes[86],
    rawBytes[87]
  );
  const rgbBitCount = view.getUint32(88, true);
  const rBitMask = view.getUint32(92, true);
  const gBitMask = view.getUint32(96, true);
  const bBitMask = view.getUint32(100, true);
  const aBitMask = view.getUint32(104, true);

  let dataOffset = 128;

  // Handle Compressed FourCC Formats (DXT1, DXT3, DXT5)
  if ((pfFlags & DDPF_FOURCC) !== 0) {
    if (fourCCStr !== 'DXT1' && fourCCStr !== 'DXT3' && fourCCStr !== 'DXT5') {
      return {
        status: {
          filename: referencedFilename,
          resolvedFilename: actualFile,
          resolutionMethod,
          foundInFolder: true,
          loaded: false,
          diagnosticState: 'unsupported_dds_format',
          containerType: 'DDS',
          format: 'UNSUPPORTED_DDS',
          width,
          height,
          mipmapCount: mipMapCount,
          error: `Unsupported DDS FourCC compression format: "${fourCCStr}"`
        }
      };
    }

    const mipmaps: Array<{ data: Uint8Array; width: number; height: number }> = [];
    let mipW = width;
    let mipH = height;
    let hasAlphaOverall = false;
    let hasTransOverall = false;

    for (let level = 0; level < mipMapCount; level++) {
      if (dataOffset >= rawBytes.length) break;
      const decoded = decodeDxtLevel(rawBytes, dataOffset, mipW, mipH, fourCCStr);
      mipmaps.push({
        data: decoded.rgba,
        width: mipW,
        height: mipH
      });
      if (level === 0) {
        hasAlphaOverall = decoded.hasAlpha;
        hasTransOverall = decoded.hasTrans;
      }
      dataOffset += decoded.bytesConsumed;
      if (mipW === 1 && mipH === 1) break;
      mipW = Math.max(1, mipW >> 1);
      mipH = Math.max(1, mipH >> 1);
    }

    if (mipmaps.length === 0) {
      return {
        status: {
          filename: referencedFilename,
          resolvedFilename: actualFile,
          resolutionMethod,
          foundInFolder: true,
          loaded: false,
          diagnosticState: 'invalid_texture',
          containerType: 'DDS',
          format: fourCCStr,
          width,
          height,
          error: 'DDS payload contained 0 decodable mipmap levels'
        }
      };
    }

    const baseRgba = mipmaps[0].data;
    const threeTexture = new THREE.DataTexture(baseRgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    if (mipmaps.length > 1) {
      threeTexture.mipmaps = mipmaps as any;
      threeTexture.generateMipmaps = false;
      threeTexture.minFilter = THREE.LinearMipmapLinearFilter;
    } else {
      threeTexture.generateMipmaps = true;
    }
    threeTexture.colorSpace = THREE.SRGBColorSpace;
    threeTexture.wrapS = THREE.RepeatWrapping;
    threeTexture.wrapT = THREE.RepeatWrapping;
    threeTexture.flipY = false;
    threeTexture.needsUpdate = true;

    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: true,
        diagnosticState: 'decoded',
        containerType: 'DDS',
        format: fourCCStr,
        width,
        height,
        mipmapCount: mipmaps.length,
        hasAlpha: hasAlphaOverall,
        hasTrans: hasTransOverall,
        colorSpace: 'srgb'
      },
      rgbaPixels: baseRgba,
      mipmaps,
      threeTexture
    };
  }

  // Handle Uncompressed RGB / RGBA DDS (24-bit or 32-bit)
  if ((pfFlags & DDPF_RGB) !== 0 && (rgbBitCount === 24 || rgbBitCount === 32)) {
    const bytesPerPixel = rgbBitCount / 8;
    const expectedBytes = width * height * bytesPerPixel;
    if (dataOffset + expectedBytes > rawBytes.length) {
      return {
        status: {
          filename: referencedFilename,
          resolvedFilename: actualFile,
          resolutionMethod,
          foundInFolder: true,
          loaded: false,
          diagnosticState: 'invalid_texture',
          containerType: 'DDS',
          format: 'UNSUPPORTED_DDS',
          width,
          height,
          error: 'Truncated uncompressed DDS pixel data'
        }
      };
    }

    const rgba = new Uint8Array(width * height * 4);
    const hasAlphaFlag = (pfFlags & DDPF_ALPHAPIXELS) !== 0 && bytesPerPixel === 4;
    const isBgr = rBitMask === 0x00ff0000 && bBitMask === 0x000000ff;
    let hasAlphaPixels = false;

    for (let i = 0; i < width * height; i++) {
      const srcIdx = dataOffset + i * bytesPerPixel;
      const dstIdx = i * 4;
      if (isBgr) {
        rgba[dstIdx] = rawBytes[srcIdx + 2];
        rgba[dstIdx + 1] = rawBytes[srcIdx + 1];
        rgba[dstIdx + 2] = rawBytes[srcIdx];
      } else {
        rgba[dstIdx] = rawBytes[srcIdx];
        rgba[dstIdx + 1] = rawBytes[srcIdx + 1];
        rgba[dstIdx + 2] = rawBytes[srcIdx + 2];
      }
      const a = hasAlphaFlag ? rawBytes[srcIdx + 3] : 255;
      rgba[dstIdx + 3] = a;
      if (a < 255 && aBitMask !== 0) hasAlphaPixels = true;
    }

    const threeTexture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    threeTexture.colorSpace = THREE.SRGBColorSpace;
    threeTexture.wrapS = THREE.RepeatWrapping;
    threeTexture.wrapT = THREE.RepeatWrapping;
    threeTexture.flipY = false;
    threeTexture.needsUpdate = true;

    return {
      status: {
        filename: referencedFilename,
        resolvedFilename: actualFile,
        resolutionMethod,
        foundInFolder: true,
        loaded: true,
        diagnosticState: 'decoded',
        containerType: 'DDS',
        format: bytesPerPixel === 4 ? 'DDS_RGBA8' : 'DDS_RGB8',
        width,
        height,
        mipmapCount: 1,
        hasAlpha: hasAlphaPixels,
        hasTrans: false,
        colorSpace: 'srgb'
      },
      rgbaPixels: rgba,
      mipmaps: [{ data: rgba, width, height }],
      threeTexture
    };
  }

  return {
    status: {
      filename: referencedFilename,
      resolvedFilename: actualFile,
      resolutionMethod,
      foundInFolder: true,
      loaded: false,
      diagnosticState: 'unsupported_dds_format',
      containerType: 'DDS',
      format: 'UNSUPPORTED_DDS',
      width,
      height,
      mipmapCount: mipMapCount,
      error: `Unsupported DDS pixel format (flags=0x${pfFlags.toString(16)}, bitCount=${rgbBitCount})`
    }
  };
}

/**
 * Build a genuine binary .DDS test buffer (DXT1, DXT3, or DXT5) with optional mipmaps
 * for deterministic verification in the regression suite.
 */
export function buildTestDdsBuffer(options: {
  width: number;
  height: number;
  format: 'DXT1' | 'DXT3' | 'DXT5';
  mipMapCount?: number;
}): Uint8Array {
  const { width, height, format, mipMapCount = 2 } = options;
  const blockSize = format === 'DXT1' ? 8 : 16;

  let totalPixelBytes = 0;
  let w = width;
  let h = height;
  for (let m = 0; m < mipMapCount; m++) {
    const bx = Math.max(1, Math.ceil(w / 4));
    const by = Math.max(1, Math.ceil(h / 4));
    totalPixelBytes += bx * by * blockSize;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }

  const out = new Uint8Array(128 + totalPixelBytes);
  const view = new DataView(out.buffer);

  view.setUint32(0, DDS_MAGIC, true); // "DDS "
  view.setUint32(4, 124, true); // dwSize = 124
  view.setUint32(8, 0x000a1007, true); // DDSD_CAPS | DDSD_HEIGHT | DDSD_WIDTH | DDSD_PIXELFORMAT | DDSD_MIPMAPCOUNT | DDSD_LINEARSIZE
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, Math.max(1, Math.ceil(width / 4)) * Math.max(1, Math.ceil(height / 4)) * blockSize, true);
  view.setUint32(28, mipMapCount, true);

  // DDS_PIXELFORMAT at offset 76
  view.setUint32(76, 32, true); // dwSize = 32
  view.setUint32(80, DDPF_FOURCC, true); // dwFlags = DDPF_FOURCC
  for (let i = 0; i < 4; i++) {
    out[84 + i] = format.charCodeAt(i);
  }

  // Fill DXT blocks across mip levels
  let ptr = 128;
  w = width;
  h = height;
  for (let m = 0; m < mipMapCount; m++) {
    const bx = Math.max(1, Math.ceil(w / 4));
    const by = Math.max(1, Math.ceil(h / 4));
    for (let i = 0; i < bx * by; i++) {
      if (format === 'DXT3') {
        // Explicit 4-bit alpha (semi-transparent 0xCC)
        for (let a = 0; a < 8; a++) out[ptr + a] = 0xcc;
        view.setUint16(ptr + 8, 0xf800, true);
        view.setUint16(ptr + 10, 0x07e0, true);
        view.setUint32(ptr + 12, 0x55555555, true);
        ptr += 16;
      } else if (format === 'DXT5') {
        // Interpolated alpha endpoints (240 and 128)
        out[ptr] = 240;
        out[ptr + 1] = 128;
        for (let a = 2; a < 8; a++) out[ptr + a] = 0x24;
        view.setUint16(ptr + 8, 0x001f, true);
        view.setUint16(ptr + 10, 0xf800, true);
        view.setUint32(ptr + 12, 0xaaaaaaaa, true);
        ptr += 16;
      } else {
        // DXT1
        view.setUint16(ptr, 0xf800, true);
        view.setUint16(ptr + 2, 0x07e0, true);
        view.setUint32(ptr + 4, 0x55555555, true);
        ptr += 8;
      }
    }
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }

  return out;
}
