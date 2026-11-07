/**
 * RailForge Consist - MSTS & Open Rails .S / .SD Shape Parser & Three.js Model Builder
 * @license Apache-2.0
 *
 * Parses MSTS .S (Shape) and .SD (Shape Descriptor) files across all 4 SIMISA combinations:
 * 1. Uncompressed Text   (SIMISA@@ + JINX0s1t______)
 * 2. Compressed Text     (SIMISA@F + zlib -> JINX0s1t______)
 * 3. Uncompressed Binary (SIMISA@@ + JINX0s1b______)
 * 4. Compressed Binary   (SIMISA@F + zlib -> JINX0s1b______)
 *
 * Implements Open Rails-style .DDS and .ACE texture resolution and individual texture diagnostics.
 */

import * as THREE from 'three';
import { decodeSimisaBuffer } from './simisaDecoder';
import { tokenizeMsts, parseMstsTokens, findSubNode, findAllSubNodes } from './mstsTokenizer';
import { decodeAceTextureBuffer } from './mstsAceLoader';
import { decodeDdsTextureBuffer } from './mstsDdsLoader';
import { TextureAssetStatus, VehicleAssetDiagnostics } from '../types/msts';

export interface ParsedSdDescriptor {
  sdFound: boolean;
  shapeRef?: string;
  esdDetailLevel?: number;
  esdAlternativeTexture?: number;
  esdBoundingBox?: [number, number, number, number, number, number];
}

export interface ParsedMstsShape {
  diagnostics: VehicleAssetDiagnostics;
  threeGroup?: THREE.Group;
}

/**
 * Parse an MSTS .SD (Shape Descriptor) file buffer
 */
export function parseSdBuffer(rawSdBytes: Uint8Array): ParsedSdDescriptor {
  const simisa = decodeSimisaBuffer(rawSdBytes);
  if (!simisa.isValidSimisa || !simisa.textPayload) {
    return { sdFound: true };
  }

  const tokens = tokenizeMsts(simisa.textPayload);
  const nodes = parseMstsTokens(tokens);
  const shapeNode = nodes.find(n => n.name.toLowerCase() === 'shape') || nodes[0];
  if (!shapeNode) return { sdFound: true };

  const shapeRef = shapeNode.values[0];
  const detailNode = findSubNode(shapeNode, 'esd_detail_level');
  const altTexNode = findSubNode(shapeNode, 'esd_alternative_texture');
  const bboxNode = findSubNode(shapeNode, 'esd_bounding_box');

  let esdBoundingBox: [number, number, number, number, number, number] | undefined;
  if (bboxNode && bboxNode.values.length >= 6) {
    const nums = bboxNode.values.slice(0, 6).map(v => parseFloat(v));
    if (nums.every(n => !isNaN(n))) {
      esdBoundingBox = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
    }
  }

  return {
    sdFound: true,
    shapeRef,
    esdDetailLevel: detailNode ? parseInt(detailNode.values[0], 10) : undefined,
    esdAlternativeTexture: altTexNode ? parseInt(altTexNode.values[0], 10) : undefined,
    esdBoundingBox
  };
}

/**
 * Open Rails-style texture resolution against a vehicle folder's texture map:
 * - If referenced without an extension (e.g. "WAP7_body"), try ".dds" first, then ".ace".
 * - If referenced with explicit ".dds" or ".ace", try the referenced format first,
 *   then fall back to the alternative extension (".dds" <-> ".ace") with the exact same stem.
 * - Never matches arbitrary or similarly-named textures.
 */
export function resolveOpenRailsTextureReference(
  rawRef: string,
  folderTextures?: Map<string, Uint8Array>
): {
  found: boolean;
  resolvedKey?: string;
  resolvedBytes?: Uint8Array;
  containerType?: 'ACE' | 'DDS';
  resolutionMethod?: TextureAssetStatus['resolutionMethod'];
} {
  if (!folderTextures || folderTextures.size === 0) {
    return { found: false };
  }

  // Strip any leading relative path components like "./" or "textures/" while keeping leaf name
  const normalizedRef = rawRef.trim().replace(/\\/g, '/').split('/').pop() || rawRef.trim();
  const lowerRef = normalizedRef.toLowerCase();

  const hasAceExt = lowerRef.endsWith('.ace');
  const hasDdsExt = lowerRef.endsWith('.dds');

  if (!hasAceExt && !hasDdsExt) {
    // 1. Extensionless reference: try .dds first, then .ace
    const ddsCandidate = `${lowerRef}.dds`;
    if (folderTextures.has(ddsCandidate)) {
      return {
        found: true,
        resolvedKey: ddsCandidate,
        resolvedBytes: folderTextures.get(ddsCandidate),
        containerType: 'DDS',
        resolutionMethod: 'extensionless_dds_first'
      };
    }
    const aceCandidate = `${lowerRef}.ace`;
    if (folderTextures.has(aceCandidate)) {
      return {
        found: true,
        resolvedKey: aceCandidate,
        resolvedBytes: folderTextures.get(aceCandidate),
        containerType: 'ACE',
        resolutionMethod: 'extensionless_ace_fallback'
      };
    }
    return { found: false };
  }

  // 2. Explicit .dds or .ace extension: try exact referenced extension first
  if (folderTextures.has(lowerRef)) {
    return {
      found: true,
      resolvedKey: lowerRef,
      resolvedBytes: folderTextures.get(lowerRef),
      containerType: hasDdsExt ? 'DDS' : 'ACE',
      resolutionMethod: 'exact_match'
    };
  }

  // 3. Documented Open Rails alternative-extension fallback on exact stem
  const stem = lowerRef.slice(0, -4);
  const altExt = hasAceExt ? '.dds' : '.ace';
  const altCandidate = `${stem}${altExt}`;

  if (folderTextures.has(altCandidate)) {
    return {
      found: true,
      resolvedKey: altCandidate,
      resolvedBytes: folderTextures.get(altCandidate),
      containerType: hasAceExt ? 'DDS' : 'ACE',
      resolutionMethod: 'openrails_alt_extension'
    };
  }

  return { found: false };
}

interface InternalShapeGeometryData {
  points: [number, number, number][];
  uvPoints: [number, number][];
  normals: [number, number, number][];
  images: string[];
  textureImageIdxs: number[];
  primStates: Array<{ texIdx: number; alphaMode: number }>;
  matrices: Array<{ name: string; elements: number[] }>;
  subObjects: Array<{
    primStateIdx: number;
    matrixIdx: number;
    positions: number[];
    normals: number[];
    uvs: number[];
  }>;
  lodCount: number;
  unsupportedFeatures: string[];
}

/**
 * Parse Text-format MSTS .S shape AST (JINX0s1t______)
 */
function parseTextShapeAst(textPayload: string): InternalShapeGeometryData {
  const tokens = tokenizeMsts(textPayload);
  const nodes = parseMstsTokens(tokens);
  const shapeNode = nodes.find(n => n.name.toLowerCase() === 'shape') || nodes[0];

  const points: [number, number, number][] = [];
  const uvPoints: [number, number][] = [];
  const normals: [number, number, number][] = [];
  const images: string[] = [];
  const textureImageIdxs: number[] = [];
  const primStates: Array<{ texIdx: number; alphaMode: number }> = [];
  const matrices: Array<{ name: string; elements: number[] }> = [];
  const subObjects: InternalShapeGeometryData['subObjects'] = [];
  const unsupportedFeatures: string[] = [];

  if (!shapeNode) {
    return {
      points,
      uvPoints,
      normals,
      images,
      textureImageIdxs,
      primStates,
      matrices,
      subObjects,
      lodCount: 0,
      unsupportedFeatures: ['Missing root shape node']
    };
  }

  // 1. Points
  const pointsNode = findSubNode(shapeNode, 'points');
  if (pointsNode) {
    for (const p of pointsNode.children) {
      if (p.name.toLowerCase() === 'point' && p.values.length >= 3) {
        points.push([
          parseFloat(p.values[0]) || 0,
          parseFloat(p.values[1]) || 0,
          parseFloat(p.values[2]) || 0
        ]);
      }
    }
  }

  // 2. UV Points
  const uvPointsNode = findSubNode(shapeNode, 'uv_points');
  if (uvPointsNode) {
    for (const uv of uvPointsNode.children) {
      if (uv.name.toLowerCase() === 'uv_point' && uv.values.length >= 2) {
        uvPoints.push([parseFloat(uv.values[0]) || 0, parseFloat(uv.values[1]) || 0]);
      }
    }
  }

  // 3. Normals
  const normalsNode = findSubNode(shapeNode, 'normals');
  if (normalsNode) {
    for (const v of normalsNode.children) {
      if (v.name.toLowerCase() === 'vector' && v.values.length >= 3) {
        normals.push([
          parseFloat(v.values[0]) || 0,
          parseFloat(v.values[1]) || 0,
          parseFloat(v.values[2]) || 0
        ]);
      }
    }
  }

  // 4. Matrices
  const matricesNode = findSubNode(shapeNode, 'matrices');
  if (matricesNode) {
    for (const m of matricesNode.children) {
      if (m.name.toLowerCase() === 'matrix') {
        const mName = m.values[0] || 'MATRIX';
        const elemNode = findSubNode(m, 'element') || m;
        const nums = (elemNode === m ? m.values.slice(1) : elemNode.values).map(v => parseFloat(v) || 0);
        matrices.push({ name: mName, elements: nums });
      }
    }
  }

  // 5. Images (.ACE / .DDS filenames)
  const imagesNode = findSubNode(shapeNode, 'images');
  if (imagesNode) {
    for (const img of imagesNode.children) {
      if (img.name.toLowerCase() === 'image' && img.values.length > 0) {
        images.push(img.values[0]);
      }
    }
  }

  // 6. Textures (index into images)
  const texturesNode = findSubNode(shapeNode, 'textures');
  if (texturesNode) {
    for (const tex of texturesNode.children) {
      if (tex.name.toLowerCase() === 'texture' && tex.values.length > 0) {
        textureImageIdxs.push(parseInt(tex.values[0], 10) || 0);
      }
    }
  }

  // 7. Prim States
  const primStatesNode = findSubNode(shapeNode, 'prim_states');
  if (primStatesNode) {
    for (const ps of primStatesNode.children) {
      if (ps.name.toLowerCase() === 'prim_state') {
        const texIdxsNode = findSubNode(ps, 'tex_idxs');
        let texIdx = 0;
        if (texIdxsNode && texIdxsNode.values.length >= 2) {
          texIdx = parseInt(texIdxsNode.values[1], 10) || 0;
        }
        const alphaMode = ps.values.length >= 5 ? parseInt(ps.values[4], 10) || 0 : 0;
        primStates.push({ texIdx, alphaMode });
      }
    }
  }

  // 8. Distance Levels (LODs)
  const distLevelsNode = findSubNode(shapeNode, 'distance_levels');
  const distLevels = distLevelsNode
    ? distLevelsNode.children.filter(c => c.name.toLowerCase() === 'distance_level')
    : [];
  const lodCount = distLevels.length || 1;
  const primaryLod = distLevels[0] || shapeNode;

  const subObjectNodes = findAllSubNodes(primaryLod, 'sub_object');
  const targetSubNodes = subObjectNodes.length > 0 ? subObjectNodes : [primaryLod];

  for (const subNode of targetSubNodes) {
    const localVerts: Array<{ pointIdx: number; normalIdx: number; uvIdx: number }> = [];
    const verticesNode = findSubNode(subNode, 'vertices');
    if (verticesNode) {
      for (const vNode of verticesNode.children) {
        if (vNode.name.toLowerCase() === 'vertex' && vNode.values.length >= 3) {
          const pointIdx = parseInt(vNode.values[1], 10) || 0;
          const normalIdx = parseInt(vNode.values[2], 10) || 0;
          let uvIdx = 0;
          const vUvNode = findSubNode(vNode, 'vertex_uvs');
          if (vUvNode && vUvNode.values.length >= 2) {
            uvIdx = parseInt(vUvNode.values[1], 10) || 0;
          }
          localVerts.push({ pointIdx, normalIdx, uvIdx });
        }
      }
    }

    const primsNode = findSubNode(subNode, 'primitives');
    if (primsNode) {
      let currentPrimStateIdx = 0;
      for (const child of primsNode.children) {
        const cName = child.name.toLowerCase();
        if (cName === 'prim_state_idx' && child.values.length > 0) {
          currentPrimStateIdx = parseInt(child.values[0], 10) || 0;
        } else if (cName === 'indexed_trilist') {
          const vIdxsNode = findSubNode(child, 'vertex_idxs');
          if (vIdxsNode && vIdxsNode.values.length >= 3) {
            const rawVals = vIdxsNode.values.map(v => parseInt(v, 10) || 0);
            const startIdx = rawVals.length % 3 === 1 && rawVals[0] === rawVals.length - 1 ? 1 : 0;

            const posArr: number[] = [];
            const normArr: number[] = [];
            const uvArr: number[] = [];

            for (let i = startIdx; i + 2 < rawVals.length; i += 3) {
              const tri = [rawVals[i], rawVals[i + 1], rawVals[i + 2]];
              for (const vRef of tri) {
                const lv = localVerts[vRef];
                const pt = lv ? points[lv.pointIdx] : points[vRef];
                const nm = lv ? normals[lv.normalIdx] : normals[vRef];
                const uv = lv ? uvPoints[lv.uvIdx] : uvPoints[vRef];

                posArr.push(pt ? pt[0] : 0, pt ? pt[1] : 0, pt ? pt[2] : 0);
                normArr.push(nm ? nm[0] : 0, nm ? nm[1] : 1, nm ? nm[2] : 0);
                uvArr.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
              }
            }

            if (posArr.length >= 9) {
              subObjects.push({
                primStateIdx: currentPrimStateIdx,
                matrixIdx: 0,
                positions: posArr,
                normals: normArr,
                uvs: uvArr
              });
            }
          }
        }
      }
    }
  }

  return {
    points,
    uvPoints,
    normals,
    images,
    textureImageIdxs,
    primStates,
    matrices,
    subObjects,
    lodCount,
    unsupportedFeatures
  };
}

/**
 * Parse Binary-format MSTS .S shape buffer (JINX0s1b______)
 */
function parseBinaryShapeBuffer(binaryPayload: Uint8Array): InternalShapeGeometryData {
  const view = new DataView(binaryPayload.buffer, binaryPayload.byteOffset, binaryPayload.byteLength);
  const points: [number, number, number][] = [];
  const uvPoints: [number, number][] = [];
  const normals: [number, number, number][] = [];
  const images: string[] = [];
  const textureImageIdxs: number[] = [];
  const primStates: Array<{ texIdx: number; alphaMode: number }> = [];
  const matrices: Array<{ name: string; elements: number[] }> = [];
  const subObjects: InternalShapeGeometryData['subObjects'] = [];
  const unsupportedFeatures: string[] = [];

  const triIndices: number[] = [];

  function walkChunks(startOffset: number, endOffset: number) {
    let offset = startOffset;
    while (offset + 9 <= endOffset) {
      const tokenId = view.getUint16(offset, true);
      const chunkByteLen = view.getUint32(offset + 4, true);
      const labelCharLen = binaryPayload[offset + 8];
      const headerSize = 9 + labelCharLen * 2;
      const chunkEnd = offset + 8 + chunkByteLen;

      if (chunkByteLen === 0 || chunkEnd > endOffset || offset + headerSize > chunkEnd) {
        break;
      }

      const bodyStart = offset + headerSize;
      const bodyLen = chunkEnd - bodyStart;

      if (tokenId === 0x4a && bodyLen >= 12) {
        points.push([
          view.getFloat32(bodyStart, true),
          view.getFloat32(bodyStart + 4, true),
          view.getFloat32(bodyStart + 8, true)
        ]);
      } else if (tokenId === 0x4c && bodyLen >= 8) {
        uvPoints.push([
          view.getFloat32(bodyStart, true),
          view.getFloat32(bodyStart + 4, true)
        ]);
      } else if (tokenId === 0x4e && bodyLen >= 12) {
        normals.push([
          view.getFloat32(bodyStart, true),
          view.getFloat32(bodyStart + 4, true),
          view.getFloat32(bodyStart + 8, true)
        ]);
      } else if (tokenId === 0x55 && bodyLen >= 2) {
        const strLen = view.getUint16(bodyStart, true);
        if (bodyStart + 2 + strLen * 2 <= chunkEnd) {
          const strBytes = binaryPayload.subarray(bodyStart + 2, bodyStart + 2 + strLen * 2);
          const imgName = new TextDecoder('utf-16le').decode(strBytes).replace(/\0/g, '').trim();
          if (imgName) images.push(imgName);
        }
      } else if (tokenId === 0x6a && bodyLen >= 16) {
        const count = view.getUint32(bodyStart, true);
        for (let i = 0; i < count && bodyStart + 4 + (i + 1) * 4 <= chunkEnd; i++) {
          triIndices.push(view.getUint32(bodyStart + 4 + i * 4, true));
        }
      } else if (
        tokenId === 0x44 ||
        tokenId === 0x49 ||
        tokenId === 0x4b ||
        tokenId === 0x4d ||
        tokenId === 0x54 ||
        tokenId === 0x69
      ) {
        const childOffset = tokenId === 0x44 || tokenId === 0x69 ? bodyStart : bodyStart + 4;
        if (childOffset < chunkEnd) {
          walkChunks(childOffset, chunkEnd);
        }
      }

      offset = chunkEnd;
    }
  }

  walkChunks(0, binaryPayload.length);

  if (points.length >= 3 && triIndices.length >= 3) {
    const posArr: number[] = [];
    const normArr: number[] = [];
    const uvArr: number[] = [];

    for (let i = 0; i + 2 < triIndices.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const idx = triIndices[i + k];
        const pt = points[idx] || [0, 0, 0];
        const nm = normals[idx] || [0, 1, 0];
        const uv = uvPoints[idx] || [0, 0];
        posArr.push(pt[0], pt[1], pt[2]);
        normArr.push(nm[0], nm[1], nm[2]);
        uvArr.push(uv[0], uv[1]);
      }
    }

    subObjects.push({
      primStateIdx: 0,
      matrixIdx: 0,
      positions: posArr,
      normals: normArr,
      uvs: uvArr
    });
  }

  return {
    points,
    uvPoints,
    normals,
    images,
    textureImageIdxs: images.map((_, idx) => idx),
    primStates: [{ texIdx: 0, alphaMode: 0 }],
    matrices,
    subObjects,
    lodCount: 1,
    unsupportedFeatures
  };
}

/**
 * Parse an MSTS .S shape file and optional .SD descriptor + folder .DDS / .ACE textures
 */
export function parseMstsShapeWithAssets(options: {
  shapeFilename?: string;
  shapeBytes?: Uint8Array;
  sdFilename?: string;
  sdBytes?: Uint8Array;
  folderTextures?: Map<string, Uint8Array>; // lowercase filename -> raw bytes
}): ParsedMstsShape {
  const { shapeFilename, shapeBytes, sdFilename, sdBytes, folderTextures } = options;

  const parsedSd: ParsedSdDescriptor = sdBytes ? parseSdBuffer(sdBytes) : { sdFound: false };

  if (!shapeFilename) {
    return {
      diagnostics: {
        shapeFound: false,
        shapeLoaded: false,
        sdFound: parsedSd.sdFound,
        sdFilename,
        texturesReferenced: [],
        textureStatuses: [],
        texturesFoundCount: 0,
        texturesLoadedCount: 0,
        missingTextures: [],
        unsupportedFeatures: [],
        invalidReferences: ['No WagonShape property specified in ENG/WAG file'],
        renderMode: 'parametric_fallback'
      }
    };
  }

  if (!shapeBytes) {
    return {
      diagnostics: {
        shapeFilename,
        shapeFound: false,
        shapeLoaded: false,
        sdFilename: sdFilename || `${shapeFilename}d`,
        sdFound: parsedSd.sdFound,
        esdBoundingBox: parsedSd.esdBoundingBox,
        esdAlternativeTexture: parsedSd.esdAlternativeTexture,
        texturesReferenced: [],
        textureStatuses: [],
        texturesFoundCount: 0,
        texturesLoadedCount: 0,
        missingTextures: [],
        unsupportedFeatures: [],
        invalidReferences: [`Referenced shape "${shapeFilename}" not found in vehicle directory`],
        renderMode: 'parametric_fallback'
      }
    };
  }

  const simisa = decodeSimisaBuffer(shapeBytes);
  if (!simisa.isValidSimisa) {
    return {
      diagnostics: {
        shapeFilename,
        shapeFound: true,
        shapeLoaded: false,
        shapeCompression: simisa.compression === 'zlib_compressed' ? 'zlib_compressed' : 'uncompressed',
        shapeRepresentation: simisa.representation === 'binary' ? 'binary' : 'unknown',
        shapeJinxSignature: simisa.jinxSignature,
        sdFilename: sdFilename || `${shapeFilename}d`,
        sdFound: parsedSd.sdFound,
        esdBoundingBox: parsedSd.esdBoundingBox,
        esdAlternativeTexture: parsedSd.esdAlternativeTexture,
        texturesReferenced: [],
        textureStatuses: [],
        texturesFoundCount: 0,
        texturesLoadedCount: 0,
        missingTextures: [],
        unsupportedFeatures: simisa.diagnostics,
        invalidReferences: [],
        renderMode: 'parametric_fallback'
      }
    };
  }

  let geoData: InternalShapeGeometryData;
  if (simisa.representation === 'text' && simisa.textPayload) {
    geoData = parseTextShapeAst(simisa.textPayload);
  } else if (simisa.representation === 'binary' && simisa.binaryPayload) {
    geoData = parseBinaryShapeBuffer(simisa.binaryPayload);
  } else {
    return {
      diagnostics: {
        shapeFilename,
        shapeFound: true,
        shapeLoaded: false,
        shapeCompression: simisa.compression === 'zlib_compressed' ? 'zlib_compressed' : 'uncompressed',
        shapeRepresentation: 'unknown',
        shapeJinxSignature: simisa.jinxSignature,
        sdFilename: sdFilename || `${shapeFilename}d`,
        sdFound: parsedSd.sdFound,
        texturesReferenced: [],
        textureStatuses: [],
        texturesFoundCount: 0,
        texturesLoadedCount: 0,
        missingTextures: [],
        unsupportedFeatures: ['Unsupported shape stream representation'],
        invalidReferences: [],
        renderMode: 'parametric_fallback'
      }
    };
  }

  // Resolve referenced textures using Open Rails .DDS / .ACE resolution rules
  const textureStatuses: TextureAssetStatus[] = [];
  const missingTextures: string[] = [];
  const decodedTexturesByImageIdx = new Map<
    number,
    { status: TextureAssetStatus; threeTexture?: THREE.DataTexture }
  >();

  geoData.images.forEach((imgName, idx) => {
    const resolved = resolveOpenRailsTextureReference(imgName, folderTextures);

    if (!resolved.found || !resolved.resolvedBytes || !resolved.resolvedKey) {
      missingTextures.push(imgName);
      textureStatuses.push({
        filename: imgName,
        foundInFolder: false,
        loaded: false,
        assignedToMaterial: false,
        diagnosticState: 'missing',
        error: 'Texture file (.dds or .ace) not present in vehicle folder'
      });
    } else if (resolved.containerType === 'DDS') {
      const decodedDds = decodeDdsTextureBuffer(
        resolved.resolvedBytes,
        imgName,
        resolved.resolvedKey,
        resolved.resolutionMethod
      );
      textureStatuses.push(decodedDds.status);
      if (decodedDds.status.loaded && decodedDds.threeTexture) {
        decodedTexturesByImageIdx.set(idx, {
          status: decodedDds.status,
          threeTexture: decodedDds.threeTexture
        });
      }
    } else {
      const decodedAce = decodeAceTextureBuffer(resolved.resolvedBytes, imgName);
      const statusWithMeta: TextureAssetStatus = {
        ...decodedAce.status,
        resolvedFilename: resolved.resolvedKey,
        resolutionMethod: resolved.resolutionMethod,
        containerType: 'ACE',
        diagnosticState: decodedAce.status.loaded ? 'decoded' : 'invalid_texture',
        colorSpace: 'srgb'
      };
      textureStatuses.push(statusWithMeta);
      if (statusWithMeta.loaded && decodedAce.threeTexture) {
        decodedTexturesByImageIdx.set(idx, {
          status: statusWithMeta,
          threeTexture: decodedAce.threeTexture
        });
      }
    }
  });

  // Build Three.js Group if geometry subObjects were extracted
  let threeGroup: THREE.Group | undefined;
  let totalTriangles = 0;

  if (geoData.subObjects.length > 0) {
    threeGroup = new THREE.Group();
    threeGroup.name = `msts_shape_${shapeFilename}`;

    for (const sub of geoData.subObjects) {
      const bufferGeo = new THREE.BufferGeometry();
      bufferGeo.setAttribute('position', new THREE.Float32BufferAttribute(sub.positions, 3));
      bufferGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sub.normals, 3));
      bufferGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sub.uvs, 2));

      totalTriangles += sub.positions.length / 9;

      const primState = geoData.primStates[sub.primStateIdx];
      const texSlot = primState ? primState.texIdx : 0;
      const imgIdx = geoData.textureImageIdxs[texSlot] ?? texSlot;
      const decodedTex = decodedTexturesByImageIdx.get(imgIdx);

      if (decodedTex?.threeTexture) {
        decodedTex.status.assignedToMaterial = true;
        decodedTex.status.diagnosticState = 'assigned_to_material';
      }

      const mat = new THREE.MeshStandardMaterial({
        color: decodedTex?.threeTexture ? 0xffffff : 0xb8c2cc,
        map: decodedTex?.threeTexture || null,
        roughness: 0.45,
        metalness: 0.25,
        transparent: Boolean(decodedTex?.status.hasAlpha || (primState && primState.alphaMode > 0)),
        alphaTest: decodedTex?.status.hasTrans ? 0.5 : 0
      });

      const mesh = new THREE.Mesh(bufferGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      threeGroup.add(mesh);
    }
  }

  const texturesFoundCount = textureStatuses.filter(t => t.foundInFolder).length;
  const texturesLoadedCount = textureStatuses.filter(t => t.loaded).length;
  const shapeLoaded = Boolean(threeGroup && threeGroup.children.length > 0);
  const renderMode: VehicleAssetDiagnostics['renderMode'] = shapeLoaded
    ? texturesLoadedCount > 0 || geoData.images.length === 0
      ? 'authentic_shape_textured'
      : 'authentic_shape_untextured'
    : 'parametric_fallback';

  for (const ts of textureStatuses) {
    if (!ts.loaded && ts.error) {
      geoData.unsupportedFeatures.push(`${ts.filename}: ${ts.error}`);
    }
  }

  if (!shapeLoaded && geoData.points.length === 0) {
    geoData.unsupportedFeatures.push('Binary/text shape contained 0 decodable indexed_trilist triangles');
  }

  return {
    diagnostics: {
      shapeFilename,
      shapeFound: true,
      shapeLoaded,
      shapeCompression: simisa.compression === 'zlib_compressed' ? 'zlib_compressed' : 'uncompressed',
      shapeRepresentation: simisa.representation === 'binary' ? 'binary' : 'text',
      shapeJinxSignature: simisa.jinxSignature,
      lodCount: geoData.lodCount,
      vertexCount: geoData.points.length,
      triangleCount: Math.round(totalTriangles),
      matrixCount: geoData.matrices.length,
      sdFilename: sdFilename || `${shapeFilename}d`,
      sdFound: parsedSd.sdFound,
      esdBoundingBox: parsedSd.esdBoundingBox,
      esdAlternativeTexture: parsedSd.esdAlternativeTexture,
      texturesReferenced: geoData.images,
      textureStatuses,
      texturesFoundCount,
      texturesLoadedCount,
      missingTextures,
      unsupportedFeatures: geoData.unsupportedFeatures,
      invalidReferences: [],
      renderMode
    },
    threeGroup
  };
}

/**
 * Helper to build a genuine binary JINX0s1b______ shape payload for the SIMISA regression test matrix
 */
export function buildTestBinaryShapePayload(textureName: string = 'WAP7_body.ace'): Uint8Array {
  function makeChunk(tokenId: number, body: Uint8Array): Uint8Array {
    const chunkLen = 1 + body.length;
    const out = new Uint8Array(9 + body.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, tokenId, true);
    dv.setUint16(2, 0, true);
    dv.setUint32(4, chunkLen, true);
    out[8] = 0; // label length 0
    out.set(body, 9);
    return out;
  }

  function concatArrays(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const res = new Uint8Array(total);
    let pos = 0;
    for (const a of arrays) {
      res.set(a, pos);
      pos += a.length;
    }
    return res;
  }

  // 4 points (quad)
  const pts = [
    [-1.5, 0.5, -10.0],
    [1.5, 0.5, -10.0],
    [1.5, 4.0, -10.0],
    [-1.5, 4.0, -10.0]
  ];
  const pointChunks = pts.map(p => {
    const b = new Uint8Array(12);
    const dv = new DataView(b.buffer);
    dv.setFloat32(0, p[0], true);
    dv.setFloat32(4, p[1], true);
    dv.setFloat32(8, p[2], true);
    return makeChunk(0x4a, b);
  });
  const countPrefix4 = new Uint8Array(4);
  new DataView(countPrefix4.buffer).setUint32(0, 4, true);
  const pointsContainer = makeChunk(0x49, concatArrays([countPrefix4, ...pointChunks]));

  // 4 uv_points
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ];
  const uvChunks = uvs.map(u => {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    dv.setFloat32(0, u[0], true);
    dv.setFloat32(4, u[1], true);
    return makeChunk(0x4c, b);
  });
  const uvContainer = makeChunk(0x4b, concatArrays([countPrefix4, ...uvChunks]));

  // 1 image chunk
  const imgBody = new Uint8Array(2 + textureName.length * 2);
  const imgDv = new DataView(imgBody.buffer);
  imgDv.setUint16(0, textureName.length, true);
  for (let i = 0; i < textureName.length; i++) {
    imgDv.setUint16(2 + i * 2, textureName.charCodeAt(i), true);
  }
  const countPrefix1 = new Uint8Array(4);
  new DataView(countPrefix1.buffer).setUint32(0, 1, true);
  const imagesContainer = makeChunk(0x54, concatArrays([countPrefix1, makeChunk(0x55, imgBody)]));

  // indexed_trilist with vertex_idxs (2 triangles = 6 indices)
  const vIdxBody = new Uint8Array(4 + 6 * 4);
  const vIdxDv = new DataView(vIdxBody.buffer);
  vIdxDv.setUint32(0, 6, true);
  [0, 1, 2, 0, 2, 3].forEach((val, idx) => vIdxDv.setUint32(4 + idx * 4, val, true));
  const triListContainer = makeChunk(0x69, makeChunk(0x6a, vIdxBody));

  const shapeChunk = makeChunk(0x44, concatArrays([pointsContainer, uvContainer, imagesContainer, triListContainer]));

  const jinx = 'JINX0s1b______\r\n';
  const jinxBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) jinxBytes[i] = jinx.charCodeAt(i);

  return concatArrays([jinxBytes, shapeChunk]);
}
