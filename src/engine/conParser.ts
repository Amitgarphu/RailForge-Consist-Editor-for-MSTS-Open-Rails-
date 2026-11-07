/**
 * RailForge Consist - MSTS .CON Consist File Parser
 * @license Apache-2.0
 */

import { ConsistFile, ConsistVehicleEntry, VehicleItem } from '../types/msts';
import { tokenizeMsts, parseMstsTokens, findSubNode } from './mstsTokenizer';
import { classifyVehicle } from './vehicleClassifier';
import { decodeSimisaBuffer } from './simisaDecoder';

/**
 * Parse a .CON ArrayBuffer (supports UTF-16LE, ASCII/UTF-8, and SIMISA@F zlib-compressed .CON files)
 */
export function parseConArrayBuffer(
  buffer: ArrayBuffer,
  filename: string,
  installedLookup?: Map<string, VehicleItem>
): ConsistFile {
  const bytes = new Uint8Array(buffer);
  const decoded = decodeSimisaBuffer(bytes);
  const text = decoded.textPayload || new TextDecoder('utf-8').decode(bytes);
  return parseConContent(text, filename, installedLookup);
}

export function parseConContent(
  rawContent: string,
  filename: string,
  installedLookup?: Map<string, VehicleItem>
): ConsistFile {
  const id = filename.toLowerCase().replace(/\.con$/i, '');
  const tokens = tokenizeMsts(rawContent);
  const nodes = parseMstsTokens(tokens);

  const trainNode = nodes.find((n) => n.name.toLowerCase() === 'train');
  const trainCfg = trainNode ? findSubNode(trainNode, 'traincfg') : undefined;

  let displayName = id;
  let serial = 1;
  let maxVelocityMps = 44.44444; // ~160 km/h
  let nextWagonUid = 1;
  let durability = 1.0;
  const vehicles: ConsistVehicleEntry[] = [];

  if (trainCfg) {
    if (trainCfg.values.length > 0) {
      displayName = trainCfg.values[0];
    }

    const nameNode = findSubNode(trainCfg, 'name');
    if (nameNode && nameNode.values.length > 0) {
      displayName = nameNode.values[0];
    }

    const serialNode = findSubNode(trainCfg, 'serial');
    if (serialNode && serialNode.values.length > 0) {
      serial = parseInt(serialNode.values[0], 10) || 1;
    }

    const velNode = findSubNode(trainCfg, 'maxvelocity');
    if (velNode && velNode.values.length > 0) {
      maxVelocityMps = parseFloat(velNode.values[0]) || 44.44444;
    }

    const uidNode = findSubNode(trainCfg, 'nextwagonuid');
    if (uidNode && uidNode.values.length > 0) {
      nextWagonUid = parseInt(uidNode.values[0], 10) || 1;
    }

    const durNode = findSubNode(trainCfg, 'durability');
    if (durNode && durNode.values.length > 0) {
      durability = parseFloat(durNode.values[0]) || 1.0;
    }

    // Iterate through children in order (Engine and Wagon)
    for (const child of trainCfg.children) {
      const childName = child.name.toLowerCase();
      if (childName === 'engine' || childName === 'wagon') {
        const isEngine = childName === 'engine';
        let baseFile = '';
        let folder = '';
        let uid = vehicles.length;
        let flipDirection = false;

        // Check for Flip
        const flipNode = findSubNode(child, 'flip') || findSubNode(child, 'flipdirection');
        if (flipNode) {
          flipDirection = true;
        }

        // UiD
        const uidSubNode = findSubNode(child, 'uid');
        if (uidSubNode && uidSubNode.values.length > 0) {
          uid = parseInt(uidSubNode.values[0], 10);
        }

        // Data node: EngineData or WagonData
        const dataNode = isEngine
          ? findSubNode(child, 'enginedata')
          : findSubNode(child, 'wagondata');

        if (dataNode && dataNode.values.length >= 2) {
          baseFile = dataNode.values[0];
          folder = dataNode.values[1];
        } else if (child.values.length >= 2) {
          baseFile = child.values[0];
          folder = child.values[1];
        }

        const ext = isEngine ? '.eng' : '.wag';
        const fileWithExt = baseFile.toLowerCase().endsWith(ext) ? baseFile : `${baseFile}${ext}`;
        const canonicalKey = `${folder.toLowerCase()}/${fileWithExt.toLowerCase()}`;
        const vehicleId = `${folder}/${fileWithExt}`;

        // Strictly resolve against exact (folder, filename) canonical entry if installedLookup is provided
        const installedMatch = installedLookup?.get(canonicalKey);

        if (installedMatch) {
          vehicles.push({
            uid,
            vehicleId,
            filename: baseFile.replace(/\.(eng|wag)$/i, ''),
            folder: installedMatch.folder || folder,
            name: installedMatch.name,
            type: isEngine ? 'engine' : 'wagon',
            flipDirection,
            category: installedMatch.category,
            subCategory: installedMatch.subCategory,
            lengthMeters: installedMatch.lengthMeters,
            massTons: installedMatch.massTons
          });
        } else {
          const classification = classifyVehicle(
            isEngine ? 'engine' : 'wagon',
            fileWithExt,
            folder
          );

          vehicles.push({
            uid,
            vehicleId,
            filename: baseFile.replace(/\.(eng|wag)$/i, ''),
            folder,
            name: baseFile.replace(/\.(eng|wag)$/i, '').replace(/_/g, ' '),
            type: isEngine ? 'engine' : 'wagon',
            flipDirection,
            category: classification.category,
            subCategory: classification.subCategory,
            lengthMeters: isEngine ? 20.5 : 22.0,
            massTons: isEngine ? 120 : 48
          });
        }
      }
    }
  }

  return {
    id,
    filename,
    name: displayName,
    maxVelocityMps,
    durability,
    serial,
    nextWagonUid: Math.max(nextWagonUid, vehicles.length + 1),
    vehicles,
    rawText: rawContent
  };
}
