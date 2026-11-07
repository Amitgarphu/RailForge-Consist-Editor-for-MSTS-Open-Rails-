/**
 * RailForge Consist - MSTS & Open Rails .WAG File Parser
 * @license Apache-2.0
 */

import { CouplingSpec, VehicleDimensions, VehicleItem } from '../types/msts';
import { tokenizeMsts, parseMstsTokens, findSubNode } from './mstsTokenizer';
import { classifyVehicle } from './vehicleClassifier';
import { extractCouplings, detectVariantMetadata } from './engParser';

function parseMeters(val?: string, defaultVal: number = 22): number {
  if (!val) return defaultVal;
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return defaultVal;
  if (clean.includes('cm')) return +(num / 100).toFixed(3);
  if (clean.includes('mm')) return +(num / 1000).toFixed(3);
  if (clean.includes('ft')) return +(num * 0.3048).toFixed(3);
  if (clean.includes('in')) return +(num * 0.0254).toFixed(3);
  return +num.toFixed(3);
}

function parseMassTons(val?: string, defaultVal: number = 45): number {
  if (!val) return defaultVal;
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return defaultVal;
  if (clean.includes('kg')) return +(num / 1000).toFixed(2);
  if (clean.includes('lb')) return +(num * 0.000453592).toFixed(2);
  return +num.toFixed(2);
}

function parseVelocityKmh(val?: string): number | undefined {
  if (!val) return undefined;
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return undefined;
  if (clean.includes('mph')) return Math.round(num * 1.60934);
  if (clean.includes('m/s') || clean.includes('mps')) return Math.round(num * 3.6);
  if (clean.includes('km/h') || clean.includes('kmh') || clean.includes('kph')) return Math.round(num);
  return num <= 65 ? Math.round(num * 3.6) : Math.round(num);
}

export function parseWagContent(
  rawContent: string,
  filename: string,
  folder: string,
  canonicalPath?: string
): VehicleItem {
  const baseFilename = filename.replace(/\.wag$/i, '');
  const id = `${folder}/${filename}`;
  const fullCanonicalPath = canonicalPath || `TRAINSET/${folder}/${filename}`;
  const parseWarnings: string[] = [];

  try {
    const tokens = tokenizeMsts(rawContent);
    const nodes = parseMstsTokens(tokens);

    const wagonNode =
      nodes.find(n => n.name.toLowerCase() === 'wagon') ||
      (nodes.length > 0 ? findSubNode(nodes[0], 'wagon') : undefined);

    if (!wagonNode) {
      parseWarnings.push('No top-level Wagon block found');
    }

    let displayName = baseFilename;
    let hasInternalName = false;
    let wagonShape: string | undefined;
    let dimensions: VehicleDimensions | undefined;
    let hasExplicitSize = false;
    let massTons = 48;
    let hasExplicitMass = false;
    let wagonTypeRaw: string | undefined;
    let maxVelocityKmh: number | undefined;
    let maxVelocityRaw: string | undefined;
    let sound: string | undefined;
    let couplings: CouplingSpec[] = [];
    let brakeSystem: string | undefined;
    let brakeEquipmentType: string | undefined;

    if (wagonNode) {
      // Name subnode
      const nameNode = findSubNode(wagonNode, 'name');
      if (nameNode && nameNode.values.length > 0) {
        displayName = nameNode.values.join(' ');
        hasInternalName = true;
      }

      // Type subnode
      const typeNode = wagonNode.children.find(c => c.name.toLowerCase() === 'type') || findSubNode(wagonNode, 'type');
      if (typeNode && typeNode.values.length > 0) {
        wagonTypeRaw = typeNode.values[0];
      }

      // WagonShape
      const shapeNode = findSubNode(wagonNode, 'wagonshape');
      if (shapeNode && shapeNode.values.length > 0) {
        wagonShape = shapeNode.values[0];
      } else {
        parseWarnings.push('Missing WagonShape reference in Wagon block');
      }

      // Size
      const sizeNode = findSubNode(wagonNode, 'size');
      if (sizeNode && sizeNode.values.length >= 3) {
        dimensions = {
          width: parseMeters(sizeNode.values[0], 3.2),
          height: parseMeters(sizeNode.values[1], 4.0),
          length: parseMeters(sizeNode.values[2], 22.0)
        };
        hasExplicitSize = true;
      }

      // Mass
      const massNode = findSubNode(wagonNode, 'mass');
      if (massNode && massNode.values.length > 0) {
        massTons = parseMassTons(massNode.values[0], 48);
        hasExplicitMass = true;
      }

      // MaxVelocity
      const velNode = findSubNode(wagonNode, 'maxvelocity');
      if (velNode && velNode.values.length > 0) {
        maxVelocityRaw = velNode.values[0];
        maxVelocityKmh = parseVelocityKmh(velNode.values[0]);
      }

      // Sound
      const soundNode = findSubNode(wagonNode, 'sound');
      if (soundNode && soundNode.values.length > 0) {
        sound = soundNode.values[0];
      }

      // Couplings (Front & Rear)
      couplings = extractCouplings(wagonNode);

      // Brakes
      const brakeNode = findSubNode(wagonNode, 'brakesystemtype');
      if (brakeNode && brakeNode.values.length > 0) {
        brakeSystem = brakeNode.values.join(', ');
      }
      const brakeEqNode = findSubNode(wagonNode, 'brakeequipmenttype');
      if (brakeEqNode && brakeEqNode.values.length > 0) {
        brakeEquipmentType = brakeEqNode.values.join(', ');
      }
    }

    const classification = classifyVehicle(
      'wagon',
      filename,
      folder,
      displayName,
      undefined,
      wagonTypeRaw,
      wagonShape
    );

    const variantMeta = detectVariantMetadata(filename, displayName);
    const resolvedDims = dimensions || { width: 3.2, height: 4.0, length: 22.0 };

    return {
      id,
      canonicalPath: fullCanonicalPath,
      filename,
      baseFilename,
      folder,
      name: displayName,
      hasInternalName,
      type: 'wagon',
      wagonTypeRaw,
      tractionType: 'none',
      category: classification.category,
      subCategory: classification.subCategory,
      shed: classification.shed,
      dimensions: resolvedDims,
      hasExplicitSize,
      lengthMeters: resolvedDims.length,
      massTons,
      hasExplicitMass,
      maxVelocityKmh,
      maxVelocityRaw,
      wagonShape,
      sound,
      couplerType: couplings[0]?.type,
      rearCouplerType: couplings[1]?.type || couplings[0]?.type,
      couplings,
      brakeSystem,
      brakeEquipmentType,
      rawTokens: tokens.slice(0, 120),
      parsingStatus: wagonNode ? 'valid' : 'warning',
      parseWarnings,
      isVariant: variantMeta.isVariant,
      variantKind: variantMeta.variantKind
    };
  } catch (err: any) {
    const fallbackClass = classifyVehicle('wagon', filename, folder);
    return {
      id,
      canonicalPath: fullCanonicalPath,
      filename,
      baseFilename,
      folder,
      name: baseFilename,
      hasInternalName: false,
      type: 'wagon',
      tractionType: 'none',
      category: fallbackClass.category,
      subCategory: fallbackClass.subCategory,
      shed: fallbackClass.shed,
      lengthMeters: 22.0,
      massTons: 48,
      rawTokens: [],
      parsingStatus: 'malformed',
      parseWarnings: [err?.message || 'Malformed WAG syntax']
    };
  }
}
