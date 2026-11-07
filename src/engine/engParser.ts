/**
 * RailForge Consist - MSTS & Open Rails .ENG File Parser
 * @license Apache-2.0
 */

import { CouplingSpec, VehicleDimensions, VehicleItem } from '../types/msts';
import { tokenizeMsts, parseMstsTokens, findSubNode, findAllSubNodes, MstsNode } from './mstsTokenizer';
import { classifyVehicle } from './vehicleClassifier';

/**
 * Parse unit values such as "3.0m", "4.2m", "20.5m" or numeric values
 */
function parseMeters(val?: string, defaultVal: number = 20): number {
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

/**
 * Parse mass like "123t", "123000kg", "120"
 */
function parseMassTons(val?: string, defaultVal: number = 100): number {
  if (!val) return defaultVal;
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return defaultVal;
  if (clean.includes('kg')) return +(num / 1000).toFixed(2);
  if (clean.includes('lb')) return +(num * 0.000453592).toFixed(2);
  return +num.toFixed(2);
}

/**
 * Parse power like "6000hp", "4500kW" -> returns { hp, kw }
 */
function parsePower(val?: string): { hp?: number; kw?: number } {
  if (!val) return {};
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return {};
  if (clean.includes('kw')) {
    return {
      kw: Math.round(num),
      hp: Math.round(num * 1.34102)
    };
  }
  if (clean.includes('w') && !clean.includes('kw')) {
    const kw = num / 1000;
    return {
      kw: Math.round(kw),
      hp: Math.round(kw * 1.34102)
    };
  }
  return {
    hp: Math.round(num),
    kw: Math.round(num * 0.7457)
  };
}

/**
 * Parse tractive force like "320kN", "52000lbf", "320000N" -> kN
 */
function parseForceKn(val?: string): number | undefined {
  if (!val) return undefined;
  const clean = val.toLowerCase();
  const num = parseFloat(clean.replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return undefined;
  if (clean.includes('lbf') || clean.includes('lb')) {
    return +(num * 0.00444822).toFixed(1);
  }
  if (clean.includes('kn')) {
    return +num.toFixed(1);
  }
  if (clean.includes('n')) {
    return +(num / 1000).toFixed(1);
  }
  return num > 2000 ? +(num / 1000).toFixed(1) : +num.toFixed(1);
}

/**
 * Parse velocity like "160km/h", "100mph", "44.44m/s" -> km/h
 */
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

/**
 * Extract all Coupling blocks (front and rear) from a Wagon node
 */
export function extractCouplings(wagonNode: MstsNode): CouplingSpec[] {
  const couplingNodes = wagonNode.children.filter(c => c.name.toLowerCase() === 'coupling');
  return couplingNodes.map(cNode => {
    const typeNode = findSubNode(cNode, 'type');
    const springNode = findSubNode(cNode, 'spring');
    const stiffnessNode = springNode ? findSubNode(springNode, 'stiffness') : undefined;
    const dampingNode = springNode ? findSubNode(springNode, 'damping') : undefined;
    const breakNode = springNode ? findSubNode(springNode, 'break') : undefined;
    const r0Node = springNode ? findSubNode(springNode, 'r0') : undefined;

    return {
      type: typeNode?.values[0] || cNode.values[0] || 'Automatic',
      springStiffness: stiffnessNode?.values.join(' '),
      damping: dampingNode?.values.join(' '),
      breakForce: breakNode?.values.join(' '),
      r0: r0Node?.values.join(' ')
    };
  });
}

/**
 * Detect whether a vehicle definition is an AI, Trail, Dead, Helper, or NoLight variant
 * Note: Never classifies a locomotive as a helper merely for lacking a CabView.
 */
export function detectVariantMetadata(
  filename: string,
  displayName: string
): { isVariant: boolean; variantKind?: 'AI' | 'Trail' | 'Dead' | 'Helper' | 'Flipped' | 'NoLight' } {
  const base = filename.replace(/\.(eng|wag)$/i, '');
  const combined = `${base} ${displayName}`;

  if (base.startsWith('#') || /(?:^|[\s_-])AI(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'AI' };
  }
  if (/(?:^|[\s_-])(?:TRAIL|TRAILING)(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'Trail' };
  }
  if (/(?:^|[\s_-])(?:DEAD|UNPOWERED|DUMMY)(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'Dead' };
  }
  if (/(?:^|[\s_-])(?:HELPER|BANKER)(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'Helper' };
  }
  if (/(?:^|[\s_-])(?:NOLIGHT|NO_LIGHT|NDL)(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'NoLight' };
  }
  if (/(?:^|[\s_-])(?:FLIP|FLIPPED|REV)(?:$|[\s_-])/i.test(combined)) {
    return { isVariant: true, variantKind: 'Flipped' };
  }

  return { isVariant: false };
}

export function parseEngContent(
  rawContent: string,
  filename: string,
  folder: string,
  canonicalPath?: string
): VehicleItem {
  const baseFilename = filename.replace(/\.eng$/i, '');
  const id = `${folder}/${filename}`;
  const fullCanonicalPath = canonicalPath || `TRAINSET/${folder}/${filename}`;
  const parseWarnings: string[] = [];

  try {
    const tokens = tokenizeMsts(rawContent);
    const nodes = parseMstsTokens(tokens);

    // Locate Wagon and Engine nodes
    const wagonNode =
      nodes.find(n => n.name.toLowerCase() === 'wagon') ||
      (nodes.length > 0 ? findSubNode(nodes[0], 'wagon') : undefined);
    const engineNode =
      nodes.find(n => n.name.toLowerCase() === 'engine') ||
      (wagonNode ? findSubNode(wagonNode, 'engine') : undefined);

    if (!wagonNode && !engineNode) {
      parseWarnings.push('No top-level Wagon or Engine block found');
    }

    let displayName = baseFilename;
    let hasInternalName = false;
    let description: string | undefined;
    let wagonShape: string | undefined;
    let dimensions: VehicleDimensions | undefined;
    let hasExplicitSize = false;
    let massTons = 120;
    let hasExplicitMass = false;
    let powerHp: number | undefined;
    let powerKw: number | undefined;
    let maxForceKn: number | undefined;
    let maxContinuousForceKn: number | undefined;
    let maxVelocityKmh: number | undefined;
    let maxVelocityRaw: string | undefined;
    let engineTypeRaw: string | undefined;
    let wagonTypeRaw: string | undefined;
    let sound: string | undefined;
    let cabview: string | undefined;
    let couplings: CouplingSpec[] = [];
    let brakeSystem: string | undefined;
    let brakeEquipmentType: string | undefined;
    let adheasion: string | undefined;

    if (wagonNode) {
      // Check Name inside Wagon (...) first
      const wagonNameNode = wagonNode.children.find(c => c.name.toLowerCase() === 'name');
      if (wagonNameNode && wagonNameNode.values.length > 0) {
        displayName = wagonNameNode.values.join(' ');
        hasInternalName = true;
      }

      // Type inside Wagon (...)
      const wTypeNode = wagonNode.children.find(c => c.name.toLowerCase() === 'type');
      if (wTypeNode && wTypeNode.values.length > 0) {
        wagonTypeRaw = wTypeNode.values[0];
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
          width: parseMeters(sizeNode.values[0], 3.1),
          height: parseMeters(sizeNode.values[1], 4.2),
          length: parseMeters(sizeNode.values[2], 20.5)
        };
        hasExplicitSize = true;
      }

      // Mass
      const massNode = findSubNode(wagonNode, 'mass');
      if (massNode && massNode.values.length > 0) {
        massTons = parseMassTons(massNode.values[0], 120);
        hasExplicitMass = true;
      }

      // Sound
      const soundNode = wagonNode.children.find(c => c.name.toLowerCase() === 'sound');
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

      // Adheasion
      const adhNode = findSubNode(wagonNode, 'adheasion');
      if (adhNode && adhNode.values.length > 0) {
        adheasion = adhNode.values.join(' ');
      }
    }

    if (engineNode) {
      // Name inside Engine (...) takes highest priority in MSTS/TSRE5
      const engNameNode = engineNode.children.find(c => c.name.toLowerCase() === 'name');
      if (engNameNode && engNameNode.values.length > 0) {
        displayName = engNameNode.values.join(' ');
        hasInternalName = true;
      } else if (!hasInternalName) {
        const deepName = findSubNode(engineNode, 'name');
        if (deepName && deepName.values.length > 0) {
          displayName = deepName.values.join(' ');
          hasInternalName = true;
        }
      }

      // Description
      const descNode = findSubNode(engineNode, 'description');
      if (descNode && descNode.values.length > 0) {
        description = descNode.values.join(' ');
      }

      // Type inside Engine (...)
      const typeNode = engineNode.children.find(c => c.name.toLowerCase() === 'type') || findSubNode(engineNode, 'type');
      if (typeNode && typeNode.values.length > 0) {
        engineTypeRaw = typeNode.values[0];
      }

      // MaxPower
      const powerNode = findSubNode(engineNode, 'maxpower') || findSubNode(engineNode, 'ortsmaxindipower');
      if (powerNode && powerNode.values.length > 0) {
        const parsedPower = parsePower(powerNode.values[0]);
        powerHp = parsedPower.hp;
        powerKw = parsedPower.kw;
      }

      // MaxForce & MaxContinuousForce
      const forceNode = findSubNode(engineNode, 'maxforce');
      if (forceNode && forceNode.values.length > 0) {
        maxForceKn = parseForceKn(forceNode.values[0]);
      }
      const contForceNode = findSubNode(engineNode, 'maxcontinuousforce');
      if (contForceNode && contForceNode.values.length > 0) {
        maxContinuousForceKn = parseForceKn(contForceNode.values[0]);
      }

      // MaxVelocity
      const velNode = findSubNode(engineNode, 'maxvelocity');
      if (velNode && velNode.values.length > 0) {
        maxVelocityRaw = velNode.values[0];
        maxVelocityKmh = parseVelocityKmh(velNode.values[0]);
      }

      // CabView
      const cabNode = findSubNode(engineNode, 'cabview');
      if (cabNode && cabNode.values.length > 0) {
        cabview = cabNode.values[0];
      }

      // Sound inside Engine if not found in Wagon
      if (!sound) {
        const engSound = findSubNode(engineNode, 'sound');
        if (engSound && engSound.values.length > 0) {
          sound = engSound.values[0];
        }
      }
    }

    const classification = classifyVehicle(
      'engine',
      filename,
      folder,
      displayName,
      engineTypeRaw,
      wagonTypeRaw,
      wagonShape
    );

    const variantMeta = detectVariantMetadata(filename, displayName);
    const resolvedDims = dimensions || { width: 3.1, height: 4.2, length: 20.5 };

    return {
      id,
      canonicalPath: fullCanonicalPath,
      filename,
      baseFilename,
      folder,
      name: displayName,
      hasInternalName,
      description,
      type: 'engine',
      engineTypeRaw,
      wagonTypeRaw,
      tractionType: classification.tractionType,
      category: classification.category,
      subCategory: classification.subCategory,
      shed: classification.shed,
      dimensions: resolvedDims,
      hasExplicitSize,
      lengthMeters: resolvedDims.length,
      massTons,
      hasExplicitMass,
      powerHp,
      powerKw,
      maxForceKn,
      maxContinuousForceKn,
      maxVelocityKmh,
      maxVelocityRaw,
      wagonShape,
      sound,
      cabview,
      couplerType: couplings[0]?.type,
      rearCouplerType: couplings[1]?.type || couplings[0]?.type,
      couplings,
      brakeSystem,
      brakeEquipmentType,
      adheasion,
      rawTokens: tokens.slice(0, 120),
      parsingStatus: wagonNode || engineNode ? 'valid' : 'warning',
      parseWarnings,
      isVariant: variantMeta.isVariant,
      variantKind: variantMeta.variantKind
    };
  } catch (err: any) {
    const fallbackClass = classifyVehicle('engine', filename, folder);
    return {
      id,
      canonicalPath: fullCanonicalPath,
      filename,
      baseFilename,
      folder,
      name: baseFilename,
      hasInternalName: false,
      type: 'engine',
      tractionType: fallbackClass.tractionType,
      category: fallbackClass.category,
      subCategory: fallbackClass.subCategory,
      shed: fallbackClass.shed,
      lengthMeters: 20.5,
      massTons: 120,
      rawTokens: [],
      parsingStatus: 'malformed',
      parseWarnings: [err?.message || 'Malformed ENG syntax']
    };
  }
}
