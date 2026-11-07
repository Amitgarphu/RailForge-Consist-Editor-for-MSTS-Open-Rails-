/**
 * RailForge Consist - SIMISA Header, Encoding & Zlib Decompression Engine
 * @license Apache-2.0
 *
 * Separates MSTS file compression (SIMISA@@ vs SIMISA@F) from character encoding
 * (ASCII/UTF-8 vs UTF-16LE/BE) and payload representation (JINX0...t text vs JINX0...b binary).
 */

export type SimisaCompression = 'uncompressed' | 'zlib_compressed' | 'none';
export type SimisaEncoding = 'ascii_utf8' | 'utf16le' | 'utf16be';
export type SimisaRepresentation = 'text' | 'binary' | 'ace_texture' | 'unknown';

export interface SimisaDecodeResult {
  isValidSimisa: boolean;
  compression: SimisaCompression;
  encoding: SimisaEncoding;
  representation: SimisaRepresentation;
  jinxSignature?: string; // e.g. "JINX0s1t______", "JINX0s1b______", "JINX0D0t______"
  declaredUncompressedSize?: number;
  textPayload?: string;
  binaryPayload?: Uint8Array; // Decompressed payload starting AFTER the 16-byte JINX0 header (or full payload for ACE)
  rawDecompressedBytes?: Uint8Array; // Full decompressed buffer including JINX0 header
  contentHash: string;
  diagnostics: string[];
}

/**
 * Deterministic 32-bit FNV-1a content hash for duplicate detection across folders
 */
export function computeContentHash(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + `_${bytes.length}`;
}

/**
 * Pure TypeScript RFC 1951 (Deflate) & RFC 1950 (Zlib) Decompressor
 * Supports Stored (BTYPE=00), Fixed Huffman (BTYPE=01), and Dynamic Huffman (BTYPE=10) blocks.
 */
const FIXED_LIT_TABLE = (() => {
  const lengths = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) lengths[i] = 8;
  for (let i = 144; i <= 255; i++) lengths[i] = 9;
  for (let i = 256; i <= 279; i++) lengths[i] = 7;
  for (let i = 280; i <= 287; i++) lengths[i] = 8;
  return buildHuffmanTable(lengths);
})();

const FIXED_DIST_TABLE = (() => {
  const lengths = new Uint8Array(32);
  lengths.fill(5);
  return buildHuffmanTable(lengths);
})();

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
];
const LEN_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface HuffmanTable {
  counts: Uint16Array;
  symbols: Uint16Array;
  maxBits: number;
}

function buildHuffmanTable(lengths: Uint8Array): HuffmanTable {
  let maxBits = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > maxBits) maxBits = lengths[i];
  }
  if (maxBits === 0) {
    return { counts: new Uint16Array(16), symbols: new Uint16Array(0), maxBits: 0 };
  }
  const counts = new Uint16Array(maxBits + 1);
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0) counts[lengths[i]]++;
  }
  const offsets = new Uint16Array(maxBits + 1);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    offsets[bits] = code;
    code += counts[bits];
  }
  const symbols = new Uint16Array(code);
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (len > 0) {
      symbols[offsets[len]++] = sym;
    }
  }
  return { counts, symbols, maxBits };
}

export function inflateZlibOrRawSync(input: Uint8Array, expectedSize?: number): Uint8Array {
  let pos = 0;
  // Check for 2-byte RFC 1950 zlib header (e.g. 0x78 0x01, 0x78 0x5E, 0x78 0x9C, 0x78 0xDA)
  if (
    input.length >= 2 &&
    (input[0] & 0x0f) === 8 &&
    ((input[0] << 8) + input[1]) % 31 === 0
  ) {
    pos = 2;
  }

  let bitBuf = 0;
  let bitCount = 0;

  function bits(n: number): number {
    while (bitCount < n) {
      if (pos >= input.length) throw new Error('Unexpected EOF in deflate stream');
      bitBuf |= input[pos++] << bitCount;
      bitCount += 8;
    }
    const val = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCount -= n;
    return val;
  }

  function decodeSymbol(table: HuffmanTable): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= table.maxBits; len++) {
      code |= bits(1);
      const count = table.counts[len];
      if (code - count < first) {
        return table.symbols[index + (code - first)];
      }
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in deflate stream');
  }

  let out = new Uint8Array(expectedSize && expectedSize > 0 ? expectedSize : Math.max(4096, input.length * 4));
  let outPos = 0;

  function ensureCap(extra: number) {
    if (outPos + extra > out.length) {
      const next = new Uint8Array(Math.max(out.length * 2, outPos + extra + 4096));
      next.set(out);
      out = next;
    }
  }

  let isFinal = 0;
  while (!isFinal) {
    isFinal = bits(1);
    const btype = bits(2);

    if (btype === 0) {
      // Uncompressed stored block
      bitBuf = 0;
      bitCount = 0;
      if (pos + 4 > input.length) throw new Error('Truncated stored block header');
      const len = input[pos] | (input[pos + 1] << 8);
      const nlen = input[pos + 2] | (input[pos + 3] << 8);
      pos += 4;
      if ((len ^ 0xffff) !== nlen) throw new Error('Stored block length complement mismatch');
      if (pos + len > input.length) throw new Error('Truncated stored block data');
      ensureCap(len);
      out.set(input.subarray(pos, pos + len), outPos);
      pos += len;
      outPos += len;
    } else if (btype === 1 || btype === 2) {
      let litTable = FIXED_LIT_TABLE;
      let distTable = FIXED_DIST_TABLE;

      if (btype === 2) {
        const hlit = bits(5) + 257;
        const hdist = bits(5) + 1;
        const hclen = bits(4) + 4;
        const clenLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          clenLengths[CLEN_ORDER[i]] = bits(3);
        }
        const clenTable = buildHuffmanTable(clenLengths);
        const totalCodes = hlit + hdist;
        const codeLengths = new Uint8Array(totalCodes);
        let i = 0;
        while (i < totalCodes) {
          const sym = decodeSymbol(clenTable);
          if (sym < 16) {
            codeLengths[i++] = sym;
          } else if (sym === 16) {
            const repeat = bits(2) + 3;
            const prev = i > 0 ? codeLengths[i - 1] : 0;
            for (let r = 0; r < repeat; r++) codeLengths[i++] = prev;
          } else if (sym === 17) {
            const repeat = bits(3) + 3;
            for (let r = 0; r < repeat; r++) codeLengths[i++] = 0;
          } else if (sym === 18) {
            const repeat = bits(7) + 11;
            for (let r = 0; r < repeat; r++) codeLengths[i++] = 0;
          }
        }
        litTable = buildHuffmanTable(codeLengths.subarray(0, hlit));
        distTable = buildHuffmanTable(codeLengths.subarray(hlit, totalCodes));
      }

      while (true) {
        const sym = decodeSymbol(litTable);
        if (sym < 256) {
          ensureCap(1);
          out[outPos++] = sym;
        } else if (sym === 256) {
          break;
        } else {
          const lenIdx = sym - 257;
          const length = LEN_BASE[lenIdx] + (LEN_EXTRA[lenIdx] > 0 ? bits(LEN_EXTRA[lenIdx]) : 0);
          const distSym = decodeSymbol(distTable);
          const dist = DIST_BASE[distSym] + (DIST_EXTRA[distSym] > 0 ? bits(DIST_EXTRA[distSym]) : 0);
          if (dist > outPos) throw new Error('Invalid back-reference distance in deflate stream');
          ensureCap(length);
          for (let k = 0; k < length; k++) {
            out[outPos] = out[outPos - dist];
            outPos++;
          }
        }
      }
    } else {
      throw new Error('Reserved deflate block type 3');
    }
  }

  return out.subarray(0, outPos);
}

/**
 * Pure TypeScript RFC 1950 Zlib Compressor (Stored blocks + Adler32)
 * Used for creating genuine SIMISA@F compressed test fixtures deterministically.
 */
export function compressZlibSync(payload: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const numBlocks = Math.max(1, Math.ceil(payload.length / maxBlock));
  const out = new Uint8Array(2 + payload.length + numBlocks * 5 + 4);
  let pos = 0;

  // Zlib header: CMF = 0x78 (Deflate, 32K window), FLG = 0x01 (no dict, check bits)
  out[pos++] = 0x78;
  out[pos++] = 0x01;

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1;
    const chunkLen = Math.min(maxBlock, payload.length - offset);
    out[pos++] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE=00 (stored)
    out[pos++] = chunkLen & 0xff;
    out[pos++] = (chunkLen >>> 8) & 0xff;
    const nlen = chunkLen ^ 0xffff;
    out[pos++] = nlen & 0xff;
    out[pos++] = (nlen >>> 8) & 0xff;
    out.set(payload.subarray(offset, offset + chunkLen), pos);
    pos += chunkLen;
    offset += chunkLen;
  }

  // Compute Adler-32 checksum
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < payload.length; i++) {
    s1 = (s1 + payload[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  out[pos++] = (adler >>> 24) & 0xff;
  out[pos++] = (adler >>> 16) & 0xff;
  out[pos++] = (adler >>> 8) & 0xff;
  out[pos++] = adler & 0xff;

  return out.subarray(0, pos);
}

/**
 * Helper to create a SIMISA@F compressed file buffer (ASCII or UTF-16LE header layout)
 */
export function buildSimisaCompressedBuffer(
  innerPayload: Uint8Array,
  useUtf16HeaderLayout: boolean = false
): Uint8Array {
  const zlibStream = compressZlibSync(innerPayload);
  const size = innerPayload.length;

  if (!useUtf16HeaderLayout) {
    // Standard 16-byte ASCII SIMISA@F header: "SIMISA@F" + 4-byte LE size + "@@@@"
    const header = new Uint8Array(16);
    const prefix = 'SIMISA@F';
    for (let i = 0; i < 8; i++) header[i] = prefix.charCodeAt(i);
    header[8] = size & 0xff;
    header[9] = (size >>> 8) & 0xff;
    header[10] = (size >>> 16) & 0xff;
    header[11] = (size >>> 24) & 0xff;
    for (let i = 12; i < 16; i++) header[i] = 0x40; // '@'

    const result = new Uint8Array(16 + zlibStream.length);
    result.set(header, 0);
    result.set(zlibStream, 16);
    return result;
  } else {
    // UTF-16LE BOM (FF FE) + 16 wide chars (32 bytes) header layout
    const header = new Uint8Array(34);
    header[0] = 0xff;
    header[1] = 0xfe;
    const prefix = 'SIMISA@F';
    for (let i = 0; i < 8; i++) {
      header[2 + i * 2] = prefix.charCodeAt(i);
      header[2 + i * 2 + 1] = 0x00;
    }
    // 4-byte size stored across bytes 18..25
    header[18] = size & 0xff;
    header[19] = (size >>> 8) & 0xff;
    header[20] = (size >>> 16) & 0xff;
    header[21] = (size >>> 24) & 0xff;
    for (let i = 22; i < 34; i += 2) {
      header[i] = 0x40;
      header[i + 1] = 0x00;
    }

    const result = new Uint8Array(34 + zlibStream.length);
    result.set(header, 0);
    result.set(zlibStream, 34);
    return result;
  }
}

/**
 * Read ASCII string from byte slice
 */
function readAscii(bytes: Uint8Array, start: number, len: number): string {
  let out = '';
  const end = Math.min(bytes.length, start + len);
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Read UTF-16LE string from byte slice
 */
function readUtf16Le(bytes: Uint8Array, start: number, byteLen: number): string {
  const slice = bytes.subarray(start, Math.min(bytes.length, start + byteLen));
  return new TextDecoder('utf-16le').decode(slice);
}

/**
 * Decode any MSTS/Open Rails buffer (.ENG, .WAG, .CON, .S, .SD, .ACE)
 */
export function decodeSimisaBuffer(rawBytes: Uint8Array): SimisaDecodeResult {
  const diagnostics: string[] = [];
  const contentHash = computeContentHash(rawBytes);

  if (rawBytes.length === 0) {
    return {
      isValidSimisa: false,
      compression: 'none',
      encoding: 'ascii_utf8',
      representation: 'unknown',
      contentHash,
      diagnostics: ['Empty file (0 bytes)']
    };
  }

  let offset = 0;
  let encoding: SimisaEncoding = 'ascii_utf8';

  // 1. Detect BOM or null-interleaved UTF-16
  if (rawBytes.length >= 2 && rawBytes[0] === 0xff && rawBytes[1] === 0xfe) {
    encoding = 'utf16le';
    offset = 2;
    diagnostics.push('Detected UTF-16LE BOM (0xFF 0xFE)');
  } else if (rawBytes.length >= 2 && rawBytes[0] === 0xfe && rawBytes[1] === 0xff) {
    encoding = 'utf16be';
    offset = 2;
    diagnostics.push('Detected UTF-16BE BOM (0xFE 0xFF)');
  } else if (
    rawBytes.length >= 12 &&
    rawBytes[0] === 0x53 && // 'S'
    rawBytes[1] === 0x00 &&
    rawBytes[2] === 0x49 && // 'I'
    rawBytes[3] === 0x00 &&
    rawBytes[4] === 0x4d && // 'M'
    rawBytes[5] === 0x00
  ) {
    encoding = 'utf16le';
    diagnostics.push('Detected BOM-less UTF-16LE stream');
  }

  // 2. Check SIMISA magic prefix
  let magic8 = '';
  if (encoding === 'utf16le' && rawBytes.length >= offset + 16) {
    magic8 = readUtf16Le(rawBytes, offset, 16);
  } else if (rawBytes.length >= offset + 8) {
    magic8 = readAscii(rawBytes, offset, 8);
  }

  // Check if it is an Open Rails include/override text file without a SIMISA header
  if (!magic8.startsWith('SIMISA')) {
    const decodedText =
      encoding === 'utf16le'
        ? new TextDecoder('utf-16le').decode(rawBytes.subarray(offset))
        : encoding === 'utf16be'
        ? new TextDecoder('utf-16be').decode(rawBytes.subarray(offset))
        : new TextDecoder('utf-8').decode(rawBytes.subarray(offset));

    const trimmed = decodedText.trimStart();
    if (/^(include|wagon|engine|train|shape|comment|skip|\()/i.test(trimmed)) {
      diagnostics.push('Headerless MSTS/Open Rails text definition');
      return {
        isValidSimisa: true,
        compression: 'uncompressed',
        encoding,
        representation: 'text',
        textPayload: decodedText,
        contentHash,
        diagnostics
      };
    }

    return {
      isValidSimisa: false,
      compression: 'none',
      encoding,
      representation: 'unknown',
      textPayload: decodedText,
      contentHash,
      diagnostics: [...diagnostics, `Missing SIMISA header (found "${magic8.slice(0, 8).replace(/[^\x20-\x7E]/g, '?')}")`]
    };
  }

  // 3. Determine Compression: SIMISA@@ (Uncompressed) vs SIMISA@F (Zlib Compressed)
  const isCompressed = magic8 === 'SIMISA@F';
  let workBytes: Uint8Array;
  let workEncoding: SimisaEncoding = encoding;
  let declaredUncompressedSize: number | undefined;

  if (isCompressed) {
    diagnostics.push('Detected SIMISA@F compressed header');
    let zlibStart = offset + 16;

    if (encoding === 'utf16le') {
      // Check if zlib stream starts at offset + 16 (ASCII header after BOM) or offset + 32 (wide UTF-16 header)
      const cand16 = offset + 16;
      const cand32 = offset + 32;
      if (
        cand32 < rawBytes.length &&
        rawBytes[offset + 1] === 0x00 &&
        rawBytes[offset + 3] === 0x00
      ) {
        declaredUncompressedSize =
          (rawBytes[offset + 16] |
            (rawBytes[offset + 17] << 8) |
            (rawBytes[offset + 18] << 16) |
            (rawBytes[offset + 19] << 24)) >>>
          0;
        zlibStart = cand32;
      } else {
        declaredUncompressedSize =
          (rawBytes[offset + 8] |
            (rawBytes[offset + 9] << 8) |
            (rawBytes[offset + 10] << 16) |
            (rawBytes[offset + 11] << 24)) >>>
          0;
        zlibStart = cand16;
      }
    } else {
      declaredUncompressedSize =
        (rawBytes[offset + 8] |
          (rawBytes[offset + 9] << 8) |
          (rawBytes[offset + 10] << 16) |
          (rawBytes[offset + 11] << 24)) >>>
        0;
      zlibStart = offset + 16;
    }

    try {
      const compressedSlice = rawBytes.subarray(zlibStart);
      workBytes = inflateZlibOrRawSync(compressedSlice, declaredUncompressedSize);
      diagnostics.push(`Decompressed SIMISA@F stream (${compressedSlice.length} -> ${workBytes.length} bytes)`);
    } catch (err: any) {
      return {
        isValidSimisa: false,
        compression: 'zlib_compressed',
        encoding,
        representation: 'unknown',
        declaredUncompressedSize,
        contentHash,
        diagnostics: [...diagnostics, `SIMISA@F zlib decompression failed: ${err?.message || String(err)}`]
      };
    }

    // Inspect encoding of decompressed inner payload (could be ASCII/UTF-8 or UTF-16LE JINX0)
    if (
      workBytes.length >= 10 &&
      workBytes[0] === 0x4a && // 'J'
      workBytes[1] === 0x00 &&
      workBytes[2] === 0x49 && // 'I'
      workBytes[3] === 0x00
    ) {
      workEncoding = 'utf16le';
    } else if (
      workBytes.length >= 12 &&
      workBytes[0] === 0xff &&
      workBytes[1] === 0xfe
    ) {
      workEncoding = 'utf16le';
      workBytes = workBytes.subarray(2);
    } else {
      workEncoding = 'ascii_utf8';
    }
  } else {
    // Uncompressed SIMISA@@@@@@@@@@
    diagnostics.push('Detected SIMISA@@ uncompressed header');
    if (encoding === 'utf16le' && rawBytes[offset + 1] === 0x00) {
      workBytes = rawBytes.subarray(offset + 32);
    } else {
      workBytes = rawBytes.subarray(offset + 16);
    }
  }

  // 4. Inspect Inner 16-char JINX0 Sub-Header (or ACE Texture Header)
  let jinxSignature = '';
  let payloadAfterJinx = workBytes;

  if (workEncoding === 'utf16le' && workBytes.length >= 32) {
    const candidate = readUtf16Le(workBytes, 0, 32);
    if (candidate.startsWith('JINX0')) {
      jinxSignature = candidate;
      payloadAfterJinx = workBytes.subarray(32);
    }
  } else if (workBytes.length >= 16) {
    const candidate = readAscii(workBytes, 0, 16);
    if (candidate.startsWith('JINX0')) {
      jinxSignature = candidate;
      payloadAfterJinx = workBytes.subarray(16);
    }
  }

  // Check for MSTS .ACE texture header ("SIMISA@@@@@@@@@@" + 0x01 0x00 0x00 0x00 where workBytes starts with 0x01 0x00 0x00 0x00)
  if (!jinxSignature && workBytes.length >= 32 && workBytes[0] === 0x01 && workBytes[1] === 0x00 && workBytes[2] === 0x00 && workBytes[3] === 0x00) {
    diagnostics.push('Detected MSTS .ACE binary texture header (version 1)');
    return {
      isValidSimisa: true,
      compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
      encoding: workEncoding,
      representation: 'ace_texture',
      jinxSignature: 'ACE_V1_BINARY',
      declaredUncompressedSize,
      binaryPayload: workBytes,
      rawDecompressedBytes: workBytes,
      contentHash,
      diagnostics
    };
  }

  if (jinxSignature) {
    diagnostics.push(`Verified inner signature: ${jinxSignature}`);
    // Format character is at index 7 of "JINX0s1t______" -> 't' (text) or 'b' (binary)
    const formatTypeChar = jinxSignature.charAt(7).toLowerCase();
    const subType = jinxSignature.slice(5, 7); // e.g. 's1' (shape), 'd0' (data/eng/wag/con), 'F0' (ace/font)

    if (subType === 'F0' && formatTypeChar === 'b') {
      return {
        isValidSimisa: true,
        compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
        encoding: workEncoding,
        representation: 'ace_texture',
        jinxSignature,
        declaredUncompressedSize,
        binaryPayload: payloadAfterJinx,
        rawDecompressedBytes: workBytes,
        contentHash,
        diagnostics
      };
    }

    if (formatTypeChar === 'b') {
      return {
        isValidSimisa: true,
        compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
        encoding: workEncoding,
        representation: 'binary',
        jinxSignature,
        declaredUncompressedSize,
        binaryPayload: payloadAfterJinx,
        rawDecompressedBytes: workBytes,
        contentHash,
        diagnostics
      };
    }

    // Text representation ('t')
    const textPayload =
      workEncoding === 'utf16le'
        ? new TextDecoder('utf-16le').decode(payloadAfterJinx)
        : new TextDecoder('utf-8').decode(payloadAfterJinx);

    return {
      isValidSimisa: true,
      compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
      encoding: workEncoding,
      representation: 'text',
      jinxSignature,
      declaredUncompressedSize,
      textPayload,
      rawDecompressedBytes: workBytes,
      contentHash,
      diagnostics
    };
  }

  // If no JINX0 signature was on the second line (some third-party ENG/WAG files have newline right after SIMISA@@@@@@@@@@)
  const fallbackText =
    workEncoding === 'utf16le'
      ? new TextDecoder('utf-16le').decode(workBytes)
      : new TextDecoder('utf-8').decode(workBytes);

  if (/(\bWagon\b|\bEngine\b|\bTrain\b|\bshape\b|\binclude\b)/i.test(fallbackText)) {
    diagnostics.push('Verified MSTS text blocks following SIMISA header');
    return {
      isValidSimisa: true,
      compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
      encoding: workEncoding,
      representation: 'text',
      declaredUncompressedSize,
      textPayload: fallbackText,
      rawDecompressedBytes: workBytes,
      contentHash,
      diagnostics
    };
  }

  return {
    isValidSimisa: false,
    compression: isCompressed ? 'zlib_compressed' : 'uncompressed',
    encoding: workEncoding,
    representation: 'unknown',
    declaredUncompressedSize,
    rawDecompressedBytes: workBytes,
    contentHash,
    diagnostics: [...diagnostics, 'Unrecognized payload after SIMISA header (missing JINX0 or MSTS blocks)']
  };
}

/**
 * Convenience helper to read a File object and decode its SIMISA structure
 */
export async function readAndDecodeMstsFile(file: File): Promise<SimisaDecodeResult> {
  const buffer = await file.arrayBuffer();
  return decodeSimisaBuffer(new Uint8Array(buffer));
}
