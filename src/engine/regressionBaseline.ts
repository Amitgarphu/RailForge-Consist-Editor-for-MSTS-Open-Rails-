/**
 * RailForge Consist - 3D Consist Baseline & SIMISA / OpenRails / DDS / ACE Regression Suite
 * @license Apache-2.0
 */

import * as THREE from 'three';
import { ConsistVehicleEntry } from '../types/msts';
import { buildVehicle3D, buildRailwayTrack } from '../components/viewport3d/proceduralTrainsetMesh';
import { buildSimisaCompressedBuffer, decodeSimisaBuffer, computeContentHash } from './simisaDecoder';
import { buildTestAceBuffer, decodeAceTextureBuffer } from './mstsAceLoader';
import { buildTestDdsBuffer, decodeDdsTextureBuffer } from './mstsDdsLoader';
import {
  buildTestBinaryShapePayload,
  parseMstsShapeWithAssets
} from './mstsShapeLoader';
import { parseEngContent } from './engParser';
import { parseWagContent } from './wagParser';
import { inspectOpenRailsSubfolderFile, applyOpenRailsOverrideToVehicle } from './openRailsIncludeResolver';

export interface RegressionTestCaseResult {
  id: string;
  category: '3D Baseline' | 'SIMISA Formats' | 'ACE & DDS Textures' | 'OpenRails Overrides' | 'Inventory Integrity';
  name: string;
  passed: boolean;
  details: string;
}

export interface RegressionSuiteReport {
  timestamp: string;
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  baselineConsistVertices: number;
  baselineConsistTriangles: number;
  results: RegressionTestCaseResult[];
}

/**
 * Build a genuine uncompressed text MSTS .S shape buffer (SIMISA@@@@@@@@@@ + JINX0s1t______)
 * for regression testing.
 */
function buildTestUncompressedTextShape(tex0: string = 'body_main.dds', tex1: string = 'bogie_frame.ace'): Uint8Array {
  const sText = `SIMISA@@@@@@@@@@JINX0s1t______

shape (
  shape_header ( 00000000 00000000 )
  points ( 4
    point ( -1.55 0.45 -10.28 )
    point ( 1.55 0.45 -10.28 )
    point ( 1.55 4.15 -10.28 )
    point ( -1.55 4.15 -10.28 )
  )
  uv_points ( 4
    uv_point ( 0.0 0.0 )
    uv_point ( 1.0 0.0 )
    uv_point ( 1.0 1.0 )
    uv_point ( 0.0 1.0 )
  )
  normals ( 1
    vector ( 0.0 0.0 -1.0 )
  )
  matrices ( 1
    matrix MAIN ( 1 0 0 0 1 0 0 0 1 0 0 0 )
  )
  images ( 2
    image ( ${tex0} )
    image ( ${tex1} )
  )
  textures ( 2
    texture ( 0 0 -3 ff000000 )
    texture ( 1 0 -3 ff000000 )
  )
  prim_states ( 2
    prim_state BaseBody ( 00000000 0
      tex_idxs ( 1 0 ) 0 0 0 0 1
    )
    prim_state BogieSub ( 00000000 0
      tex_idxs ( 1 1 ) 0 0 0 0 1
    )
  )
  distance_levels ( 1
    distance_level (
      sub_objects ( 1
        sub_object (
          vertices ( 4
            vertex ( 00000000 0 0 ff000000 ff000000
              vertex_uvs ( 1 0 )
            )
            vertex ( 00000000 1 0 ff000000 ff000000
              vertex_uvs ( 1 1 )
            )
            vertex ( 00000000 2 0 ff000000 ff000000
              vertex_uvs ( 1 2 )
            )
            vertex ( 00000000 3 0 ff000000 ff000000
              vertex_uvs ( 1 3 )
            )
          )
          primitives ( 4
            prim_state_idx ( 0 )
            indexed_trilist (
              vertex_idxs ( 6 0 1 2 0 2 3 )
            )
            prim_state_idx ( 1 )
            indexed_trilist (
              vertex_idxs ( 6 0 1 2 0 2 3 )
            )
          )
        )
      )
    )
  )
)`;
  return new TextEncoder().encode(sText);
}

/**
 * Build a genuine uncompressed binary MSTS .S shape buffer (SIMISA@@@@@@@@@@ + JINX0s1b______)
 */
function buildTestUncompressedBinaryShape(tex0: string = 'loco_skin.dds'): Uint8Array {
  const payload = buildTestBinaryShapePayload(tex0);
  const header = new TextEncoder().encode('SIMISA@@@@@@@@@@');
  const full = new Uint8Array(header.length + payload.length);
  full.set(header, 0);
  full.set(payload, header.length);
  return full;
}

/**
 * Execute all regression and baseline verification checks synchronously/deterministically
 */
export function runRegressionVerificationSuite(): RegressionSuiteReport {
  const results: RegressionTestCaseResult[] = [];
  let baselineVertices = 0;
  let baselineTriangles = 0;

  // =========================================================================
  // 1. BASELINE 3D CONSIST RENDERING VERIFICATION
  // =========================================================================
  try {
    const sampleConsistUnits: ConsistVehicleEntry[] = [
      {
        uid: 0,
        vehicleId: 'WAP7_Loco/WAP7_30210.eng',
        filename: 'WAP7_30210',
        folder: 'WAP7_Loco',
        name: 'IR WAP-7 30210 Lallaguda',
        type: 'engine',
        flipDirection: false,
        category: 'locomotive',
        subCategory: 'Electric',
        lengthMeters: 20.56,
        massTons: 123
      },
      {
        uid: 1,
        vehicleId: 'LHB_Rajdhani/LHB_EOG.wag',
        filename: 'LHB_EOG',
        folder: 'LHB_Rajdhani',
        name: 'LHB Rajdhani Generator Car',
        type: 'wagon',
        flipDirection: false,
        category: 'brake_van',
        subCategory: 'EOG',
        lengthMeters: 23.54,
        massTons: 52
      },
      {
        uid: 2,
        vehicleId: 'LHB_Rajdhani/LHB_AC2T.wag',
        filename: 'LHB_AC2T',
        folder: 'LHB_Rajdhani',
        name: 'LHB AC 2-Tier Coach',
        type: 'wagon',
        flipDirection: false,
        category: 'passenger_lhb',
        subCategory: '2A',
        lengthMeters: 23.54,
        massTons: 39.5
      }
    ];

    const consistGroup = new THREE.Group();
    sampleConsistUnits.forEach((u, i) => {
      const mesh = buildVehicle3D(u, i);
      consistGroup.add(mesh);
    });
    const trackGroup = buildRailwayTrack(80);
    consistGroup.add(trackGroup);

    let meshCount = 0;
    consistGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        meshCount++;
        const pos = obj.geometry.getAttribute('position');
        if (pos) {
          baselineVertices += pos.count;
          if (obj.geometry.index) {
            baselineTriangles += Math.floor(obj.geometry.index.count / 3);
          } else {
            baselineTriangles += Math.floor(pos.count / 3);
          }
        }
      }
    });

    const passed = meshCount >= 20 && baselineVertices > 500 && baselineTriangles > 200;
    results.push({
      id: 'baseline-3d-consist',
      category: '3D Baseline',
      name: 'Working 3D Consist & Track Formation Baseline',
      passed,
      details: `${sampleConsistUnits.length} consist units + track rendered (${meshCount} meshes, ${baselineVertices.toLocaleString()} vertices, ${baselineTriangles.toLocaleString()} triangles)`
    });
  } catch (err: any) {
    results.push({
      id: 'baseline-3d-consist',
      category: '3D Baseline',
      name: 'Working 3D Consist & Track Formation Baseline',
      passed: false,
      details: `Error: ${err?.message || String(err)}`
    });
  }

  // =========================================================================
  // 2. SIMISA REGRESSION MATRIX (4 REPRESENTATIONS + UTF-16LE HEADER)
  // =========================================================================

  // 2A. Uncompressed Text (.S)
  try {
    const rawBytes = buildTestUncompressedTextShape('body_main.dds', 'bogie_frame.ace');
    const simisa = decodeSimisaBuffer(rawBytes);
    const ddsBytes = buildTestDdsBuffer({ width: 8, height: 8, format: 'DXT1' });
    const aceBytes = buildTestAceBuffer({ width: 8, height: 8, format: 'RGB24' });
    const textures = new Map<string, Uint8Array>([
      ['body_main.dds', ddsBytes],
      ['bogie_frame.ace', aceBytes]
    ]);
    const parsed = parseMstsShapeWithAssets({
      shapeFilename: 'test_loco.s',
      shapeBytes: rawBytes,
      folderTextures: textures
    });
    const passed =
      simisa.compression === 'uncompressed' &&
      simisa.representation === 'text' &&
      parsed.diagnostics.shapeLoaded === true &&
      parsed.diagnostics.vertexCount === 4 &&
      (parsed.diagnostics.triangleCount ?? 0) >= 2 &&
      parsed.threeGroup !== undefined;

    results.push({
      id: 'simisa-uncompressed-text',
      category: 'SIMISA Formats',
      name: 'SIMISA Uncompressed Text (SIMISA@@ + JINX0s1t)',
      passed,
      details: `Format=${simisa.compression}/${simisa.representation}, Verts=${parsed.diagnostics.vertexCount}, Tris=${parsed.diagnostics.triangleCount}`
    });
  } catch (err: any) {
    results.push({
      id: 'simisa-uncompressed-text',
      category: 'SIMISA Formats',
      name: 'SIMISA Uncompressed Text (SIMISA@@ + JINX0s1t)',
      passed: false,
      details: String(err)
    });
  }

  // 2B. Uncompressed Binary (.S)
  try {
    const rawBytes = buildTestUncompressedBinaryShape('loco_skin.dds');
    const simisa = decodeSimisaBuffer(rawBytes);
    const ddsBytes = buildTestDdsBuffer({ width: 8, height: 8, format: 'DXT5' });
    const textures = new Map<string, Uint8Array>([['loco_skin.dds', ddsBytes]]);
    const parsed = parseMstsShapeWithAssets({
      shapeFilename: 'binary_loco.s',
      shapeBytes: rawBytes,
      folderTextures: textures
    });
    const passed =
      simisa.compression === 'uncompressed' &&
      simisa.representation === 'binary' &&
      parsed.diagnostics.shapeLoaded === true &&
      parsed.diagnostics.vertexCount === 4 &&
      parsed.diagnostics.triangleCount === 2 &&
      parsed.threeGroup !== undefined;

    results.push({
      id: 'simisa-uncompressed-binary',
      category: 'SIMISA Formats',
      name: 'SIMISA Uncompressed Binary (SIMISA@@ + JINX0s1b)',
      passed,
      details: `Format=${simisa.compression}/${simisa.representation}, Verts=${parsed.diagnostics.vertexCount}, Tris=${parsed.diagnostics.triangleCount}`
    });
  } catch (err: any) {
    results.push({
      id: 'simisa-uncompressed-binary',
      category: 'SIMISA Formats',
      name: 'SIMISA Uncompressed Binary (SIMISA@@ + JINX0s1b)',
      passed: false,
      details: String(err)
    });
  }

  // 2C. Compressed Text (ASCII SIMISA@F & UTF-16LE BOM SIMISA@F)
  try {
    const uncompBytes = buildTestUncompressedTextShape('main.dds', 'sub.ace');
    const innerPayload = uncompBytes.subarray(16); // payload after 16-byte SIMISA@@ header
    const compAscii = buildSimisaCompressedBuffer(innerPayload, false);
    const compUtf16 = buildSimisaCompressedBuffer(innerPayload, true);

    const decodedAscii = decodeSimisaBuffer(compAscii);
    const decodedUtf16 = decodeSimisaBuffer(compUtf16);

    const parsedAscii = parseMstsShapeWithAssets({
      shapeFilename: 'comp_ascii.s',
      shapeBytes: compAscii
    });
    const parsedUtf16 = parseMstsShapeWithAssets({
      shapeFilename: 'comp_utf16.s',
      shapeBytes: compUtf16
    });

    const passed =
      decodedAscii.compression === 'zlib_compressed' &&
      decodedAscii.representation === 'text' &&
      decodedUtf16.compression === 'zlib_compressed' &&
      parsedAscii.diagnostics.shapeLoaded === true &&
      parsedUtf16.diagnostics.shapeLoaded === true &&
      parsedAscii.diagnostics.vertexCount === 4 &&
      parsedUtf16.diagnostics.vertexCount === 4;

    results.push({
      id: 'simisa-compressed-text',
      category: 'SIMISA Formats',
      name: 'SIMISA Compressed Text (ASCII & UTF-16LE SIMISA@F + Zlib)',
      passed,
      details: `ASCII=${decodedAscii.compression}/${decodedAscii.representation}, UTF16Header=${decodedUtf16.compression}/${decodedUtf16.representation}, Verts=${parsedUtf16.diagnostics.vertexCount}`
    });
  } catch (err: any) {
    results.push({
      id: 'simisa-compressed-text',
      category: 'SIMISA Formats',
      name: 'SIMISA Compressed Text (ASCII & UTF-16LE SIMISA@F + Zlib)',
      passed: false,
      details: String(err)
    });
  }

  // 2D. Compressed Binary (SIMISA@F + Zlib -> JINX0s1b)
  try {
    const innerPayload = buildTestBinaryShapePayload('bin_tex.dds');
    const compBin = buildSimisaCompressedBuffer(innerPayload, false);

    const decodedBin = decodeSimisaBuffer(compBin);
    const parsedBin = parseMstsShapeWithAssets({
      shapeFilename: 'comp_bin.s',
      shapeBytes: compBin
    });

    const passed =
      decodedBin.compression === 'zlib_compressed' &&
      decodedBin.representation === 'binary' &&
      parsedBin.diagnostics.shapeLoaded === true &&
      parsedBin.diagnostics.vertexCount === 4 &&
      parsedBin.diagnostics.triangleCount === 2;

    results.push({
      id: 'simisa-compressed-binary',
      category: 'SIMISA Formats',
      name: 'SIMISA Compressed Binary (SIMISA@F + Zlib -> JINX0s1b)',
      passed,
      details: `Format=${decodedBin.compression}/${decodedBin.representation}, Verts=${parsedBin.diagnostics.vertexCount}, Tris=${parsedBin.diagnostics.triangleCount}`
    });
  } catch (err: any) {
    results.push({
      id: 'simisa-compressed-binary',
      category: 'SIMISA Formats',
      name: 'SIMISA Compressed Binary (SIMISA@F + Zlib -> JINX0s1b)',
      passed: false,
      details: String(err)
    });
  }

  // =========================================================================
  // 3. ACE & MANDATORY DDS TEXTURE DECODING + OPEN RAILS RESOLUTION
  // =========================================================================

  // 3A. ACE Decoder (RGB24, RGBA32, ALPHA1, DXT1)
  try {
    const aceRgb = decodeAceTextureBuffer(
      buildTestAceBuffer({ width: 8, height: 8, format: 'RGB24' }),
      'test_rgb.ace'
    );
    const aceRgba = decodeAceTextureBuffer(
      buildTestAceBuffer({ width: 8, height: 8, format: 'RGBA32' }),
      'test_rgba.ace'
    );
    const aceAlpha1 = decodeAceTextureBuffer(
      buildTestAceBuffer({ width: 8, height: 8, format: 'ALPHA1' }),
      'test_a1.ace'
    );
    const aceDxt1 = decodeAceTextureBuffer(
      buildTestAceBuffer({ width: 8, height: 8, format: 'DXT1' }),
      'test_dxt1.ace'
    );

    const passed =
      aceRgb.status.loaded === true &&
      aceRgba.status.loaded === true &&
      aceRgba.status.hasAlpha === true &&
      aceAlpha1.status.loaded === true &&
      aceDxt1.status.loaded === true &&
      aceDxt1.status.format === 'DXT1';

    results.push({
      id: 'texture-ace-formats',
      category: 'ACE & DDS Textures',
      name: 'MSTS .ACE Texture Decoding (RGB24, RGBA32, ALPHA1, DXT1)',
      passed,
      details: `RGB24=${aceRgb.status.loaded}, RGBA32=${aceRgba.status.loaded}, ALPHA1=${aceAlpha1.status.loaded}, DXT1=${aceDxt1.status.loaded}`
    });
  } catch (err: any) {
    results.push({
      id: 'texture-ace-formats',
      category: 'ACE & DDS Textures',
      name: 'MSTS .ACE Texture Decoding (RGB24, RGBA32, ALPHA1, DXT1)',
      passed: false,
      details: String(err)
    });
  }

  // 3B. Mandatory DDS Decoder (DXT1, DXT3, DXT5 + Mipmaps & Alpha)
  try {
    const ddsDxt1 = decodeDdsTextureBuffer(
      buildTestDdsBuffer({ width: 16, height: 16, format: 'DXT1', mipMapCount: 3 }),
      'livery_dxt1.dds'
    );
    const ddsDxt3 = decodeDdsTextureBuffer(
      buildTestDdsBuffer({ width: 16, height: 16, format: 'DXT3', mipMapCount: 2 }),
      'window_dxt3.dds'
    );
    const ddsDxt5 = decodeDdsTextureBuffer(
      buildTestDdsBuffer({ width: 16, height: 16, format: 'DXT5', mipMapCount: 2 }),
      'grilles_dxt5.dds'
    );

    const passed =
      ddsDxt1.status.loaded === true &&
      ddsDxt1.status.format === 'DXT1' &&
      ddsDxt1.status.mipmapCount === 3 &&
      ddsDxt3.status.loaded === true &&
      ddsDxt3.status.format === 'DXT3' &&
      ddsDxt3.status.hasAlpha === true &&
      ddsDxt5.status.loaded === true &&
      ddsDxt5.status.format === 'DXT5' &&
      ddsDxt5.status.hasAlpha === true &&
      ddsDxt5.threeTexture !== undefined;

    results.push({
      id: 'texture-dds-formats',
      category: 'ACE & DDS Textures',
      name: 'Open Rails .DDS Texture Decoding (DXT1, DXT3, DXT5 + Mipmaps)',
      passed,
      details: `DXT1(mips=${ddsDxt1.status.mipmapCount})=${ddsDxt1.status.diagnosticState}, DXT3(alpha=${ddsDxt3.status.hasAlpha})=${ddsDxt3.status.diagnosticState}, DXT5(alpha=${ddsDxt5.status.hasAlpha})=${ddsDxt5.status.diagnosticState}`
    });
  } catch (err: any) {
    results.push({
      id: 'texture-dds-formats',
      category: 'ACE & DDS Textures',
      name: 'Open Rails .DDS Texture Decoding (DXT1, DXT3, DXT5 + Mipmaps)',
      passed: false,
      details: String(err)
    });
  }

  // 3C. Open Rails Texture Resolution & Material Assignment Diagnostics
  try {
    // Shape references "wap7_body" (extensionless) and "wap7_bogie.ace" (explicit .ace, but folder only has wap7_bogie.dds + unrelated similar_wrong.dds)
    const shapeBytes = buildTestUncompressedTextShape('wap7_body', 'wap7_bogie.ace');
    const ddsBody = buildTestDdsBuffer({ width: 8, height: 8, format: 'DXT1', mipMapCount: 1 });
    const ddsBogie = buildTestDdsBuffer({ width: 8, height: 8, format: 'DXT5', mipMapCount: 1 });

    const folderTextures = new Map<string, Uint8Array>([
      ['wap7_body.dds', ddsBody],
      ['wap7_bogie.dds', ddsBogie],
      ['similar_wrong.dds', ddsBody]
    ]);

    const parsed = parseMstsShapeWithAssets({
      shapeFilename: 'wap7.s',
      shapeBytes,
      folderTextures
    });
    const tex0 = parsed.diagnostics.textureStatuses[0];
    const tex1 = parsed.diagnostics.textureStatuses[1];

    // Verify a missing texture is NOT matched to "similar_wrong.dds"
    const missingShapeBytes = buildTestUncompressedTextShape('similar_missing.ace', 'wap7_body.dds');
    const parsedMissing = parseMstsShapeWithAssets({
      shapeFilename: 'wap7_miss.s',
      shapeBytes: missingShapeBytes,
      folderTextures
    });
    const texMissing = parsedMissing.diagnostics.textureStatuses[0];

    const passed =
      tex0.diagnosticState === 'assigned_to_material' &&
      tex0.resolutionMethod === 'extensionless_dds_first' &&
      tex0.assignedToMaterial === true &&
      tex1.diagnosticState === 'assigned_to_material' &&
      tex1.resolutionMethod === 'openrails_alt_extension' &&
      tex1.assignedToMaterial === true &&
      texMissing.diagnosticState === 'missing' &&
      texMissing.assignedToMaterial === false;

    results.push({
      id: 'texture-openrails-resolution',
      category: 'ACE & DDS Textures',
      name: 'Open Rails Texture Resolution (.dds Priority, Alt-Extension & Anti-Fuzzy Rule)',
      passed,
      details: `Extless->${tex0.resolvedFilename}(${tex0.diagnosticState}), AltExt->${tex1.resolvedFilename}(${tex1.diagnosticState}), SimilarMissing->${texMissing.diagnosticState}`
    });
  } catch (err: any) {
    results.push({
      id: 'texture-openrails-resolution',
      category: 'ACE & DDS Textures',
      name: 'Open Rails Texture Resolution (.dds Priority, Alt-Extension & Anti-Fuzzy Rule)',
      passed: false,
      details: String(err)
    });
  }

  // =========================================================================
  // 4. OPEN RAILS SUBFOLDER OVERRIDE SEMANTICS (INCLUDE & COMPLETE REPLACEMENT)
  // =========================================================================
  try {
    const baseEngText = `SIMISA@@@@@@@@@@JINX0D0t______
Wagon ( WAP7_30210
  Type ( Engine )
  WagonShape ( WAP7_30210.s )
  Size ( 3.1m 4.25m 20.56m )
  Mass ( 123t )
  Coupling (
    Type ( Automatic )
  )
  BrakeSystemType ( "Air_twin_pipe" )
)
Engine ( WAP7_30210
  Wagon ( WAP7_30210 )
  Type ( Electric )
  MaxPower ( 4560kW )
  MaxForce ( 322kN )
  MaxVelocity ( 140km/h )
  Name ( "IR WAP-7 30210 Base" )
)`;

    // Partial include override using [[SameName]] and overriding Name, MaxPower, and Coupling
    const partialOverrideText = `SIMISA@@@@@@@@@@JINX0D0t______
include ( "[[SameName]]" )
Wagon (
  Coupling (
    Type ( Bar )
  )
)
Engine (
  MaxPower ( 5400kW )
  Name ( "IR WAP-7 30210 OpenRails Physics" )
)`;

    const baseVehicle = parseEngContent(baseEngText, 'WAP7_30210.eng', 'IR_WAP7');
    const inspection = inspectOpenRailsSubfolderFile(
      partialOverrideText,
      'WAP7_30210.eng',
      'IR_WAP7',
      'TRAINSET/IR_WAP7/OpenRails/WAP7_30210.eng'
    );
    const mergedVehicle = applyOpenRailsOverrideToVehicle(baseVehicle, inspection);

    // Complete replacement definition inside OpenRails subfolder (no include directive)
    const fullReplacementText = `SIMISA@@@@@@@@@@JINX0D0t______
Wagon ( WAP7_30210
  Type ( Engine )
  WagonShape ( WAP7_OR_Custom.s )
  Size ( 3.1m 4.25m 21.0m )
  Mass ( 126t )
)
Engine ( WAP7_30210
  Type ( Electric )
  MaxPower ( 6000kW )
  Name ( "IR WAP-7 30210 Complete Replacement" )
)`;
    const fullInspection = inspectOpenRailsSubfolderFile(
      fullReplacementText,
      'WAP7_30210.eng',
      'IR_WAP7',
      'TRAINSET/IR_WAP7/OpenRails/WAP7_30210.eng'
    );
    const replacedVehicle = applyOpenRailsOverrideToVehicle(baseVehicle, fullInspection);

    const passed =
      inspection.mode === 'include_partial' &&
      mergedVehicle.name === 'IR WAP-7 30210 OpenRails Physics' &&
      mergedVehicle.powerKw === 5400 &&
      mergedVehicle.couplings?.[0]?.type === 'Bar' &&
      mergedVehicle.lengthMeters === 20.56 && // preserved from base
      fullInspection.mode === 'complete_replacement' &&
      replacedVehicle.name === 'IR WAP-7 30210 Complete Replacement' &&
      replacedVehicle.wagonShape === 'WAP7_OR_Custom.s' &&
      replacedVehicle.lengthMeters === 21.0;

    results.push({
      id: 'openrails-override-semantics',
      category: 'OpenRails Overrides',
      name: 'Open Rails [[SameName]] Include Merge & Complete Replacement',
      passed,
      details: `IncludeMerge(Name="${mergedVehicle.name}", Power=${mergedVehicle.powerKw}kW, Coupler=${mergedVehicle.couplings?.[0]?.type}); FullReplace(Shape=${replacedVehicle.wagonShape})`
    });
  } catch (err: any) {
    results.push({
      id: 'openrails-override-semantics',
      category: 'OpenRails Overrides',
      name: 'Open Rails [[SameName]] Include Merge & Complete Replacement',
      passed: false,
      details: String(err)
    });
  }

  // =========================================================================
  // 5. CROSS-FOLDER CONTENT HASH DUPLICATE PRESERVATION
  // =========================================================================
  try {
    const sharedWagContent = `SIMISA@@@@@@@@@@JINX0D0t______
Wagon ( BOXN_Wagon
  Type ( Freight )
  WagonShape ( BOXN.s )
  Size ( 3.2m 3.3m 10.71m )
  Mass ( 81t )
  Name ( "IR BOXN High Sided Bogie Wagon" )
)`;
    const bytes = new TextEncoder().encode(sharedWagContent);
    const hashA = computeContentHash(bytes);
    const hashB = computeContentHash(bytes);
    const vFolderA = parseWagContent(sharedWagContent, 'BOXN.wag', 'IR_Freight_Pack1');
    const vFolderB = parseWagContent(sharedWagContent, 'BOXN.wag', 'IR_Freight_Pack2');

    const passed =
      hashA === hashB &&
      vFolderA.id !== vFolderB.id &&
      vFolderA.id.toLowerCase() === 'ir_freight_pack1/boxn.wag' &&
      vFolderB.id.toLowerCase() === 'ir_freight_pack2/boxn.wag';

    results.push({
      id: 'cross-folder-duplicate-identities',
      category: 'Inventory Integrity',
      name: 'Cross-Folder Duplicate Content Hash Flagging & Distinct Identity Preservation',
      passed,
      details: `Hash=${hashA}, FolderA="${vFolderA.id}", FolderB="${vFolderB.id}" (both preserved for exact .CON resolution)`
    });
  } catch (err: any) {
    results.push({
      id: 'cross-folder-duplicate-identities',
      category: 'Inventory Integrity',
      name: 'Cross-Folder Duplicate Content Hash Flagging & Distinct Identity Preservation',
      passed: false,
      details: String(err)
    });
  }

  const passedCount = results.filter((r) => r.passed).length;

  return {
    timestamp: new Date().toISOString(),
    allPassed: passedCount === results.length,
    passedCount,
    totalCount: results.length,
    baselineConsistVertices: baselineVertices,
    baselineConsistTriangles: baselineTriangles,
    results
  };
}
