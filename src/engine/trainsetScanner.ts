/**
 * RailForge Consist - MSTS/OpenRails Dual Directory Scanner (TRAINSET & CONSISTS)
 * @license Apache-2.0
 */

import * as THREE from 'three';
import {
  VehicleItem,
  ConsistFile,
  TrainsetScanStats,
  ScanDiagnosticEntry
} from '../types/msts';
import { decodeSimisaBuffer } from './simisaDecoder';
import { parseEngContent } from './engParser';
import { parseWagContent } from './wagParser';
import {
  inspectOpenRailsSubfolderFile,
  applyOpenRailsOverrideToVehicle
} from './openRailsIncludeResolver';
import { parseMstsShapeWithAssets } from './mstsShapeLoader';
import { parseConArrayBuffer } from './conParser';

const DB_NAME = 'railforge_msts_db';
const STORE_NAME = 'handles';
const TRAINSET_HANDLE_KEY = 'trainset_dir_handle';
const CONSISTS_HANDLE_KEY = 'consists_dir_handle';

/**
 * In-memory cache of parsed Three.js 3D shape groups keyed by lowercase canonical vehicleId (`folder/file.eng`)
 */
const SHAPE_GROUP_CACHE = new Map<string, THREE.Group>();

export function getLoadedShapeGroupForVehicle(vehicleId: string): THREE.Group | null {
  const key = vehicleId.toLowerCase().replace(/\\/g, '/');
  const cached = SHAPE_GROUP_CACHE.get(key);
  return cached ? cached.clone(true) : null;
}

export function clearLoadedShapeCache(): void {
  SHAPE_GROUP_CACHE.clear();
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, TRAINSET_HANDLE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (err) {
    console.warn('Failed to store TRAINSET directory handle in IndexedDB:', err);
  }
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(TRAINSET_HANDLE_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(TRAINSET_HANDLE_KEY);
  } catch (err) {
    console.warn('Failed to clear TRAINSET directory handle:', err);
  }
}

export async function saveStoredConsistsHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, CONSISTS_HANDLE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (err) {
    console.warn('Failed to store CONSISTS directory handle in IndexedDB:', err);
  }
}

export async function getStoredConsistsHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(CONSISTS_HANDLE_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearStoredConsistsHandle(): Promise<void> {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(CONSISTS_HANDLE_KEY);
  } catch (err) {
    console.warn('Failed to clear CONSISTS directory handle:', err);
  }
}

export interface ScanProgress {
  filesExamined: number;
  vehiclesFound: number;
  currentFolder: string;
}

export interface FullTrainsetScanResult {
  vehicles: VehicleItem[];
  consists: ConsistFile[];
  invalidCount: number;
  stats: TrainsetScanStats;
  diagnostics: ScanDiagnosticEntry[];
}

/**
 * Auto-detect TRAINSET and CONSISTS handles if the user picks `TRAINS` or root MSTS folder
 */
export async function resolveMstsDirectoriesFromHandle(
  rootHandle: FileSystemDirectoryHandle
): Promise<{
  trainsetHandle: FileSystemDirectoryHandle | null;
  consistsHandle: FileSystemDirectoryHandle | null;
  detectedMode: 'trains_parent' | 'msts_root' | 'trainset_only' | 'consists_only' | 'custom_folder';
}> {
  const upperName = rootHandle.name.toUpperCase();
  let trainsetHandle: FileSystemDirectoryHandle | null = null;
  let consistsHandle: FileSystemDirectoryHandle | null = null;

  let childTrains: FileSystemDirectoryHandle | null = null;
  try {
    for await (const entry of (rootHandle as any).values()) {
      if (entry.kind === 'directory') {
        const ename = entry.name.toUpperCase();
        if (ename === 'TRAINSET') {
          trainsetHandle = entry as FileSystemDirectoryHandle;
        } else if (ename === 'CONSISTS') {
          consistsHandle = entry as FileSystemDirectoryHandle;
        } else if (ename === 'TRAINS') {
          childTrains = entry as FileSystemDirectoryHandle;
        }
      }
    }
  } catch {
    // Ignore permission issues during probing
  }

  if (trainsetHandle || consistsHandle) {
    return {
      trainsetHandle,
      consistsHandle,
      detectedMode: 'trains_parent'
    };
  }

  if (childTrains) {
    try {
      for await (const entry of (childTrains as any).values()) {
        if (entry.kind === 'directory') {
          const ename = entry.name.toUpperCase();
          if (ename === 'TRAINSET') trainsetHandle = entry as FileSystemDirectoryHandle;
          if (ename === 'CONSISTS') consistsHandle = entry as FileSystemDirectoryHandle;
        }
      }
    } catch {
      // Ignore
    }
    if (trainsetHandle || consistsHandle) {
      return {
        trainsetHandle,
        consistsHandle,
        detectedMode: 'msts_root'
      };
    }
  }

  if (upperName === 'CONSISTS') {
    return {
      trainsetHandle: null,
      consistsHandle: rootHandle,
      detectedMode: 'consists_only'
    };
  }

  return {
    trainsetHandle: rootHandle,
    consistsHandle: null,
    detectedMode: upperName === 'TRAINSET' ? 'trainset_only' : 'custom_folder'
  };
}

interface RawFolderEntry {
  folderName: string;
  baseDefinitions: Array<{ filename: string; relativePath: string; bytes: Uint8Array }>;
  openRailsDefinitions: Array<{ filename: string; relativePath: string; bytes: Uint8Array }>;
  shapeFiles: Map<string, { filename: string; bytes: Uint8Array }>;
  sdFiles: Map<string, { filename: string; bytes: Uint8Array }>;
  textureFiles: Map<string, Uint8Array>;
}

/**
 * Core processing pipeline shared by both DirectoryHandle and File[] scanners.
 */
function processCollectedVehicleFolders(
  folderMap: Map<string, RawFolderEntry>,
  trainsetPathLabel: string,
  consistsPathLabel: string | undefined,
  consistsList: ConsistFile[],
  initialDiagnostics: ScanDiagnosticEntry[],
  filesExamined: number,
  initialInvalidCount: number
): FullTrainsetScanResult {
  const diagnostics: ScanDiagnosticEntry[] = [...initialDiagnostics];
  const allVehicles: VehicleItem[] = [];
  let invalidCount = initialInvalidCount;
  let openRailsOverridesMerged = 0;

  for (const [, folderData] of folderMap.entries()) {
    const folderName = folderData.folderName;
    const folderVehiclesByLowerFile = new Map<string, VehicleItem>();

    // 1. Parse base .ENG and .WAG files in <VehicleFolder>
    for (const def of folderData.baseDefinitions) {
      try {
        const simisa = decodeSimisaBuffer(def.bytes);
        const text = simisa.textPayload;
        if (!text || text.trim().length < 10) {
          invalidCount++;
          diagnostics.push({
            canonicalPath: def.relativePath,
            classification: 'invalid_definition',
            details: `Binary or empty definition (${simisa.compression}/${simisa.representation})`
          });
          continue;
        }

        const lowerFile = def.filename.toLowerCase();
        const item = lowerFile.endsWith('.eng')
          ? parseEngContent(text, def.filename, folderName, def.relativePath)
          : parseWagContent(text, def.filename, folderName, def.relativePath);

        item.contentHash = simisa.contentHash;
        item.fileEncoding = simisa.encoding;
        folderVehiclesByLowerFile.set(lowerFile, item);
      } catch (err: any) {
        invalidCount++;
        diagnostics.push({
          canonicalPath: def.relativePath,
          classification: 'invalid_definition',
          details: err?.message || 'Parse error'
        });
      }
    }

    // 2. Process <VehicleFolder>/OpenRails/*.eng and *.wag overrides
    for (const orDef of folderData.openRailsDefinitions) {
      try {
        const simisa = decodeSimisaBuffer(orDef.bytes);
        const text = simisa.textPayload;
        if (!text) continue;

        const inspection = inspectOpenRailsSubfolderFile(
          text,
          orDef.filename,
          folderName,
          orDef.relativePath
        );

        const targetLowerFile = (
          inspection.resolvedParentFilename || orDef.filename
        ).toLowerCase();
        const parentVehicle =
          folderVehiclesByLowerFile.get(targetLowerFile) ||
          folderVehiclesByLowerFile.get(orDef.filename.toLowerCase());

        if (parentVehicle && inspection.mode !== 'invalid') {
          const updated = applyOpenRailsOverrideToVehicle(parentVehicle, inspection);
          folderVehiclesByLowerFile.set(parentVehicle.filename.toLowerCase(), updated);
          openRailsOverridesMerged++;
          diagnostics.push({
            canonicalPath: orDef.relativePath,
            classification:
              inspection.mode === 'include_partial'
                ? 'openrails_override_partial'
                : 'openrails_override_replacement',
            details:
              inspection.mode === 'include_partial'
                ? `OpenRails include override (${inspection.includeRawTarget}) merged into ${updated.filename}`
                : `OpenRails complete replacement merged into ${updated.filename}`
          });
        } else if (inspection.mode === 'complete_replacement') {
          // Complete replacement definition inside OpenRails subfolder when no base file exists
          const isEng = orDef.filename.toLowerCase().endsWith('.eng');
          const standalone = isEng
            ? parseEngContent(text, orDef.filename, folderName, `TRAINSET/${folderName}/${orDef.filename}`)
            : parseWagContent(text, orDef.filename, folderName, `TRAINSET/${folderName}/${orDef.filename}`);
          standalone.contentHash = simisa.contentHash;
          folderVehiclesByLowerFile.set(orDef.filename.toLowerCase(), standalone);
          openRailsOverridesMerged++;
          diagnostics.push({
            canonicalPath: orDef.relativePath,
            classification: 'openrails_override_replacement',
            details: `OpenRails standalone complete definition registered for ${folderName}/${orDef.filename}`
          });
        } else {
          diagnostics.push({
            canonicalPath: orDef.relativePath,
            classification: 'openrails_override_partial',
            details: `OpenRails include target "${inspection.resolvedParentFilename}" not found in ${folderName}`
          });
        }
      } catch (err: any) {
        diagnostics.push({
          canonicalPath: orDef.relativePath,
          classification: 'invalid_definition',
          details: `OpenRails override error: ${err?.message || String(err)}`
        });
      }
    }

    // 3. Variant Grouping within the same folder (preserve every raw file in allVehicles, link variants to primary)
    const folderVehicles = Array.from(folderVehiclesByLowerFile.values());
    if (folderVehicles.length > 0) {
      const primary = folderVehicles.find((v) => !v.isVariant) || folderVehicles[0];
      const variantIds: string[] = [];

      for (const veh of folderVehicles) {
        if (veh.id !== primary.id && veh.isVariant) {
          veh.familyPrimaryId = primary.id;
          variantIds.push(veh.id);
          diagnostics.push({
            canonicalPath: veh.canonicalPath,
            classification: 'variant_vehicle',
            details: `${veh.variantKind || 'Variant'} grouped under primary ${primary.id}`
          });
        } else {
          veh.familyPrimaryId = primary.id;
          diagnostics.push({
            canonicalPath: veh.canonicalPath,
            classification: 'primary_vehicle',
            details: `Primary ${veh.type.toUpperCase()} definition (${veh.name})`
          });
        }
      }
      primary.familyVariantIds = variantIds;
    }

    // 4. Resolve .S / .SD / .DDS / .ACE assets for each vehicle in the folder
    const shapeResultCacheForFolder = new Map<
      string,
      ReturnType<typeof parseMstsShapeWithAssets>
    >();

    for (const veh of folderVehicles) {
      if (veh.wagonShape) {
        const shapeKey = veh.wagonShape.toLowerCase().replace(/^.*[/\\]/, '');
        let shapeParsed = shapeResultCacheForFolder.get(shapeKey);

        if (!shapeParsed) {
          const sEntry = folderData.shapeFiles.get(shapeKey);
          const sdKey = `${shapeKey}d`;
          const sdEntry = folderData.sdFiles.get(sdKey);

          shapeParsed = parseMstsShapeWithAssets({
            shapeFilename: veh.wagonShape,
            shapeBytes: sEntry ? sEntry.bytes : undefined,
            sdFilename: sdEntry ? sdEntry.filename : undefined,
            sdBytes: sdEntry ? sdEntry.bytes : undefined,
            folderTextures: folderData.textureFiles
          });
          shapeResultCacheForFolder.set(shapeKey, shapeParsed);
        }

        veh.assetDiagnostics = shapeParsed.diagnostics;
        if (shapeParsed.threeGroup) {
          SHAPE_GROUP_CACHE.set(veh.id.toLowerCase(), shapeParsed.threeGroup);
        }
      }

      allVehicles.push(veh);
    }
  }

  // 5. Cross-folder exact content hash duplicate detection (NEVER merge canonical IDs)
  const seenContentHashes = new Map<string, string[]>(); // hash -> vehicle.ids
  let duplicateFilesCount = 0;

  for (const veh of allVehicles) {
    if (!veh.contentHash) continue;
    const key = `${veh.type}:${veh.contentHash}`;
    const existingList = seenContentHashes.get(key);
    if (existingList && existingList.length > 0) {
      veh.isDuplicateContent = true;
      veh.duplicateOfIds = [...existingList];
      existingList.push(veh.id);
      duplicateFilesCount++;
      diagnostics.push({
        canonicalPath: veh.canonicalPath,
        classification: 'duplicate_content',
        details: `Identical file content hash (${veh.contentHash}) to ${existingList[0]} — preserved as distinct folder identity`
      });
    } else {
      seenContentHashes.set(key, [veh.id]);
    }
  }

  const engFilesDiscovered = allVehicles.filter((v) => v.type === 'engine').length;
  const wagFilesDiscovered = allVehicles.filter((v) => v.type === 'wagon').length;
  const variantDefinitionsCount = allVehicles.filter((v) => v.isVariant).length;
  const logicalVehicleFamiliesCount = allVehicles.filter((v) => !v.isVariant).length;

  const stats: TrainsetScanStats = {
    selectedPath: trainsetPathLabel,
    consistsPath: consistsPathLabel,
    totalFilesExamined: filesExamined,
    engFilesDiscovered,
    wagFilesDiscovered,
    rawSourceDefinitionsCount: allVehicles.length,
    logicalVehicleFamiliesCount,
    openRailsOverridesMergedCount: openRailsOverridesMerged,
    variantDefinitionsCount,
    duplicateFilesCount,
    invalidCount,
    conFilesDiscovered: consistsList.length,
    validConsistsCount: consistsList.length,
    brokenConsistsCount: 0,
    lastScannedTime: Date.now(),
    diagnosticLog: diagnostics
  };

  return {
    vehicles: allVehicles,
    consists: consistsList,
    invalidCount,
    stats,
    diagnostics
  };
}

/**
 * Scan a CONSISTS FileSystemDirectoryHandle for .CON files
 */
export async function scanConsistsDirectoryHandle(
  consistsHandle: FileSystemDirectoryHandle,
  installedVehicles?: VehicleItem[]
): Promise<ConsistFile[]> {
  const consists: ConsistFile[] = [];
  const lookup = new Map<string, VehicleItem>();
  if (installedVehicles) {
    for (const v of installedVehicles) {
      lookup.set(v.id.toLowerCase(), v);
    }
  }

  try {
    for await (const entry of (consistsHandle as any).values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.con')) {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          const buffer = await file.arrayBuffer();
          const parsed = parseConArrayBuffer(buffer, entry.name, lookup);
          consists.push(parsed);
        } catch (err) {
          console.warn(`Skipping invalid .CON file ${entry.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.warn('Error scanning CONSISTS directory:', err);
  }

  return consists;
}

/**
 * Scan a TRAINSET (or parent TRAINS) FileSystemDirectoryHandle
 */
export async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (progress: ScanProgress) => void,
  explicitConsistsHandle?: FileSystemDirectoryHandle | null
): Promise<FullTrainsetScanResult> {
  clearLoadedShapeCache();

  const resolved = await resolveMstsDirectoriesFromHandle(dirHandle);
  const activeTrainsetHandle = resolved.trainsetHandle || dirHandle;
  const activeConsistsHandle = explicitConsistsHandle || resolved.consistsHandle;

  const folderMap = new Map<string, RawFolderEntry>();
  const diagnostics: ScanDiagnosticEntry[] = [];
  let filesExamined = 0;
  let invalidCount = 0;

  function getOrCreateFolder(folderName: string): RawFolderEntry {
    const key = folderName.toLowerCase();
    let entry = folderMap.get(key);
    if (!entry) {
      entry = {
        folderName,
        baseDefinitions: [],
        openRailsDefinitions: [],
        shapeFiles: new Map(),
        sdFiles: new Map(),
        textureFiles: new Map()
      };
      folderMap.set(key, entry);
    }
    return entry;
  }

  async function inspectVehicleFolder(
    vehFolderHandle: FileSystemDirectoryHandle,
    folderName: string
  ) {
    const folderEntry = getOrCreateFolder(folderName);

    try {
      for await (const item of (vehFolderHandle as any).values()) {
        if (item.kind === 'file') {
          filesExamined++;
          const lower = item.name.toLowerCase();
          if (
            lower.endsWith('.eng') ||
            lower.endsWith('.wag') ||
            lower.endsWith('.s') ||
            lower.endsWith('.sd') ||
            lower.endsWith('.ace') ||
            lower.endsWith('.dds')
          ) {
            try {
              const file = await (item as FileSystemFileHandle).getFile();
              const bytes = new Uint8Array(await file.arrayBuffer());
              const relPath = `TRAINSET/${folderName}/${item.name}`;

              if (lower.endsWith('.eng') || lower.endsWith('.wag')) {
                folderEntry.baseDefinitions.push({
                  filename: item.name,
                  relativePath: relPath,
                  bytes
                });
              } else if (lower.endsWith('.s')) {
                folderEntry.shapeFiles.set(lower, { filename: item.name, bytes });
              } else if (lower.endsWith('.sd')) {
                folderEntry.sdFiles.set(lower, { filename: item.name, bytes });
              } else if (lower.endsWith('.ace') || lower.endsWith('.dds')) {
                folderEntry.textureFiles.set(lower, bytes);
              }
            } catch {
              invalidCount++;
            }
          }
        } else if (item.kind === 'directory') {
          const subLower = item.name.toLowerCase();
          if (subLower === 'openrails') {
            try {
              for await (const orItem of (item as any).values()) {
                if (orItem.kind === 'file') {
                  filesExamined++;
                  const orLower = orItem.name.toLowerCase();
                  if (orLower.endsWith('.eng') || orLower.endsWith('.wag')) {
                    const file = await (orItem as FileSystemFileHandle).getFile();
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    folderEntry.openRailsDefinitions.push({
                      filename: orItem.name,
                      relativePath: `TRAINSET/${folderName}/OpenRails/${orItem.name}`,
                      bytes
                    });
                  } else if (orLower.endsWith('.dds') || orLower.endsWith('.ace')) {
                    const file = await (orItem as FileSystemFileHandle).getFile();
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    if (!folderEntry.textureFiles.has(orLower)) {
                      folderEntry.textureFiles.set(orLower, bytes);
                    }
                  }
                }
              }
            } catch {
              // Ignore OpenRails subfolder error
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning vehicle folder ${folderName}:`, err);
    }

    if (onProgress) {
      onProgress({
        filesExamined,
        vehiclesFound: Array.from(folderMap.values()).reduce(
          (sum, f) => sum + f.baseDefinitions.length,
          0
        ),
        currentFolder: folderName
      });
    }
  }

  let hasDirectEngWag = false;
  try {
    for await (const entry of (activeTrainsetHandle as any).values()) {
      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.') || entry.name.toUpperCase() === 'CONSISTS') continue;
        await inspectVehicleFolder(entry as FileSystemDirectoryHandle, entry.name);
      } else if (entry.kind === 'file') {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.eng') || lower.endsWith('.wag')) {
          hasDirectEngWag = true;
        }
      }
    }
    if (hasDirectEngWag && folderMap.size === 0) {
      await inspectVehicleFolder(activeTrainsetHandle, activeTrainsetHandle.name);
    }
  } catch (err) {
    console.warn('Error iterating TRAINSET directory:', err);
  }

  const preliminaryResult = processCollectedVehicleFolders(
    folderMap,
    activeTrainsetHandle.name,
    activeConsistsHandle?.name,
    [],
    diagnostics,
    filesExamined,
    invalidCount
  );

  let consists: ConsistFile[] = [];
  if (activeConsistsHandle) {
    consists = await scanConsistsDirectoryHandle(
      activeConsistsHandle,
      preliminaryResult.vehicles
    );
  }

  preliminaryResult.consists = consists;
  preliminaryResult.stats.conFilesDiscovered = consists.length;
  preliminaryResult.stats.validConsistsCount = consists.length;

  if (onProgress) {
    onProgress({
      filesExamined,
      vehiclesFound: preliminaryResult.vehicles.length,
      currentFolder: 'Done'
    });
  }

  return preliminaryResult;
}

/**
 * Scan a browser File[] list (from `<input type="file" webkitdirectory />` or drag-and-drop)
 */
export async function scanFileList(
  files: File[],
  onProgress?: (progress: ScanProgress) => void
): Promise<FullTrainsetScanResult> {
  clearLoadedShapeCache();

  const folderMap = new Map<string, RawFolderEntry>();
  const rawConsistFiles: File[] = [];
  const diagnostics: ScanDiagnosticEntry[] = [];
  let filesExamined = 0;
  let invalidCount = 0;

  function getOrCreateFolder(folderName: string): RawFolderEntry {
    const key = folderName.toLowerCase();
    let entry = folderMap.get(key);
    if (!entry) {
      entry = {
        folderName,
        baseDefinitions: [],
        openRailsDefinitions: [],
        shapeFiles: new Map(),
        sdFiles: new Map(),
        textureFiles: new Map()
      };
      folderMap.set(key, entry);
    }
    return entry;
  }

  for (const file of files) {
    filesExamined++;
    const lowerName = file.name.toLowerCase();
    const rawRelPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = rawRelPath.split('/').filter(Boolean);

    if (lowerName.endsWith('.con')) {
      rawConsistFiles.push(file);
      continue;
    }

    if (
      !lowerName.endsWith('.eng') &&
      !lowerName.endsWith('.wag') &&
      !lowerName.endsWith('.s') &&
      !lowerName.endsWith('.sd') &&
      !lowerName.endsWith('.ace') &&
      !lowerName.endsWith('.dds')
    ) {
      continue;
    }

    let vehicleFolder = 'TRAINSET';
    let isOpenRailsSubfolder = false;
    let isBackupSubfolder = false;

    const trainsetIdx = parts.findIndex((p) => p.toUpperCase() === 'TRAINSET');
    if (trainsetIdx >= 0 && parts.length > trainsetIdx + 2) {
      vehicleFolder = parts[trainsetIdx + 1];
      if (parts.length > trainsetIdx + 3) {
        const subFolder = parts[trainsetIdx + 2].toLowerCase();
        if (subFolder === 'openrails') {
          isOpenRailsSubfolder = true;
        } else {
          isBackupSubfolder = true;
        }
      }
    } else if (parts.length >= 3) {
      const parentFolder = parts[parts.length - 2];
      const grandParentFolder = parts[parts.length - 3];
      if (parentFolder.toLowerCase() === 'openrails') {
        vehicleFolder = grandParentFolder;
        isOpenRailsSubfolder = true;
      } else {
        vehicleFolder = parentFolder;
      }
    } else if (parts.length === 2) {
      vehicleFolder = parts[0];
    }

    if (isBackupSubfolder && (lowerName.endsWith('.eng') || lowerName.endsWith('.wag'))) {
      continue;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const folderEntry = getOrCreateFolder(vehicleFolder);

      if (isOpenRailsSubfolder) {
        if (lowerName.endsWith('.eng') || lowerName.endsWith('.wag')) {
          folderEntry.openRailsDefinitions.push({
            filename: file.name,
            relativePath: `TRAINSET/${vehicleFolder}/OpenRails/${file.name}`,
            bytes
          });
        } else if (lowerName.endsWith('.dds') || lowerName.endsWith('.ace')) {
          if (!folderEntry.textureFiles.has(lowerName)) {
            folderEntry.textureFiles.set(lowerName, bytes);
          }
        }
      } else {
        if (lowerName.endsWith('.eng') || lowerName.endsWith('.wag')) {
          folderEntry.baseDefinitions.push({
            filename: file.name,
            relativePath: `TRAINSET/${vehicleFolder}/${file.name}`,
            bytes
          });
        } else if (lowerName.endsWith('.s')) {
          folderEntry.shapeFiles.set(lowerName, { filename: file.name, bytes });
        } else if (lowerName.endsWith('.sd')) {
          folderEntry.sdFiles.set(lowerName, { filename: file.name, bytes });
        } else if (lowerName.endsWith('.ace') || lowerName.endsWith('.dds')) {
          folderEntry.textureFiles.set(lowerName, bytes);
        }
      }

      if (onProgress && filesExamined % 15 === 0) {
        onProgress({
          filesExamined,
          vehiclesFound: folderMap.size,
          currentFolder: vehicleFolder
        });
      }
    } catch {
      invalidCount++;
    }
  }

  const result = processCollectedVehicleFolders(
    folderMap,
    'Selected TRAINSET Files',
    rawConsistFiles.length > 0 ? 'Selected CONSISTS Files' : undefined,
    [],
    diagnostics,
    filesExamined,
    invalidCount
  );

  const lookup = new Map<string, VehicleItem>();
  for (const v of result.vehicles) {
    lookup.set(v.id.toLowerCase(), v);
  }

  const parsedConsists: ConsistFile[] = [];
  for (const conFile of rawConsistFiles) {
    try {
      const buf = await conFile.arrayBuffer();
      parsedConsists.push(parseConArrayBuffer(buf, conFile.name, lookup));
    } catch {
      // Ignore invalid .con
    }
  }

  result.consists = parsedConsists;
  result.stats.conFilesDiscovered = parsedConsists.length;
  result.stats.validConsistsCount = parsedConsists.length;

  return result;
}

/**
 * Scan a browser File[] list specifically selected for the CONSISTS folder
 */
export async function scanConsistsFileList(
  files: File[],
  installedVehicles?: VehicleItem[]
): Promise<ConsistFile[]> {
  const lookup = new Map<string, VehicleItem>();
  if (installedVehicles) {
    for (const v of installedVehicles) {
      lookup.set(v.id.toLowerCase(), v);
    }
  }

  const consists: ConsistFile[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.con')) {
      try {
        const buffer = await file.arrayBuffer();
        consists.push(parseConArrayBuffer(buffer, file.name, lookup));
      } catch (err) {
        console.warn(`Skipping invalid .CON file ${file.name}:`, err);
      }
    }
  }
  return consists;
}
