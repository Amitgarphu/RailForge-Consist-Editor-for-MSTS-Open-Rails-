/**
 * RailForge Consist - Open Rails Subfolder Include & Replacement Resolver
 * @license Apache-2.0
 *
 * Implements official Open Rails semantics for `<VehicleFolder>/OpenRails/<File>.(eng|wag)`:
 * 1. Include-based partial overrides: `include ( "../<file>" )` and `include ( "[[SameName]]" )`
 * 2. Complete replacement definitions: full `Wagon ( ... )` files inside `OpenRails/`
 */

import { OpenRailsOverrideInfo, VehicleItem } from '../types/msts';
import { tokenizeMsts, parseMstsTokens } from './mstsTokenizer';
import { parseEngContent } from './engParser';
import { parseWagContent } from './wagParser';

export interface ParsedOpenRailsFile {
  mode: 'include_partial' | 'complete_replacement' | 'invalid';
  includeRawTarget?: string; // e.g. "../WAP7.eng" or "[[SameName]]"
  resolvedParentFilename?: string; // e.g. "WAP7.eng"
  overrideText: string;
  overrideFilename: string;
  parentFolder: string;
  sourcePath: string;
}

/**
 * Normalize relative path inside `OpenRails/` subfolder to parent `<VehicleFolder>/<Filename>`
 * Supports `\` and `/`, `../`, `./`, and the official Open Rails `[[SameName]]` placeholder.
 */
export function resolveOpenRailsIncludeTarget(
  includeTarget: string,
  overrideFilename: string
): string {
  const trimmed = includeTarget.trim().replace(/\\/g, '/');

  if (/^\[\[SameName\]\]$/i.test(trimmed) || trimmed.toLowerCase().endsWith('/[[samename]]')) {
    return overrideFilename;
  }

  // Strip leading ../ or ./
  const parts = trimmed.split('/').filter(Boolean);
  const leaf = parts[parts.length - 1];
  return leaf || overrideFilename;
}

/**
 * Inspect an `OpenRails/*.eng` or `OpenRails/*.wag` text payload to determine whether it is
 * an `include (...)` partial override or a complete replacement definition.
 */
export function inspectOpenRailsSubfolderFile(
  rawText: string,
  overrideFilename: string,
  parentFolder: string,
  sourcePath?: string
): ParsedOpenRailsFile {
  const fullSourcePath = sourcePath || `TRAINSET/${parentFolder}/OpenRails/${overrideFilename}`;
  const tokens = tokenizeMsts(rawText);

  if (tokens.length === 0) {
    return {
      mode: 'invalid',
      overrideText: rawText,
      overrideFilename,
      parentFolder,
      sourcePath: fullSourcePath
    };
  }

  // Look for top-level `include ( "..." )` or `include "..."` at the start of the token stream
  let idx = 0;
  // Skip optional SIMISA or JINX tokens if tokenized directly
  while (idx < tokens.length && /^(simisa|jinx0)/i.test(tokens[idx])) {
    idx++;
  }

  if (idx < tokens.length && tokens[idx].toLowerCase() === 'include') {
    let targetRaw = '';
    if (tokens[idx + 1] === '(' && idx + 2 < tokens.length) {
      targetRaw = tokens[idx + 2];
    } else if (idx + 1 < tokens.length) {
      targetRaw = tokens[idx + 1];
    }

    const resolvedParentFilename = resolveOpenRailsIncludeTarget(targetRaw, overrideFilename);
    return {
      mode: 'include_partial',
      includeRawTarget: targetRaw,
      resolvedParentFilename,
      overrideText: rawText,
      overrideFilename,
      parentFolder,
      sourcePath: fullSourcePath
    };
  }

  // Check if it is a complete replacement definition starting with Wagon ( ... )
  const hasWagonBlock = tokens.some(t => t.toLowerCase() === 'wagon');
  if (hasWagonBlock) {
    return {
      mode: 'complete_replacement',
      resolvedParentFilename: overrideFilename,
      overrideText: rawText,
      overrideFilename,
      parentFolder,
      sourcePath: fullSourcePath
    };
  }

  return {
    mode: 'invalid',
    overrideText: rawText,
    overrideFilename,
    parentFolder,
    sourcePath: fullSourcePath
  };
}

/**
 * Extract ORTS* parameters and explicitly present top-level/nested block names from an override token stream
 */
function extractOverrideSignals(rawText: string): {
  presentKeys: Set<string>;
  ortsParameters: Record<string, string>;
} {
  const tokens = tokenizeMsts(rawText);
  const nodes = parseMstsTokens(tokens);
  const presentKeys = new Set<string>();
  const ortsParameters: Record<string, string> = {};

  function walk(nodeList: typeof nodes) {
    for (const n of nodeList) {
      const lower = n.name.toLowerCase();
      presentKeys.add(lower);
      if (lower.startsWith('orts')) {
        ortsParameters[n.name] = n.values.length > 0 ? n.values.join(' ') : `(${n.children.length} sub-blocks)`;
      }
      if (n.children.length > 0) {
        walk(n.children);
      }
    }
  }

  walk(nodes);

  // Also scan flat tokens for include files that aren't wrapped in a root Wagon(...) block
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    if (
      /^(name|description|mass|size|wagonshape|maxpower|maxforce|maxcontinuousforce|maxvelocity|coupling|brakesystemtype|brakeequipmenttype|sound|cabview|lights|enginecontrollers)$/i.test(
        lower
      )
    ) {
      presentKeys.add(lower);
    }
    if (lower.startsWith('orts') && !ortsParameters[t]) {
      if (tokens[i + 1] === '(' && i + 2 < tokens.length) {
        const vals: string[] = [];
        let k = i + 2;
        while (k < tokens.length && tokens[k] !== ')' && tokens[k] !== '(' && vals.length < 4) {
          vals.push(tokens[k++]);
        }
        ortsParameters[t] = vals.join(' ') || 'defined';
      }
    }
  }

  return { presentKeys, ortsParameters };
}

/**
 * Merge an Open Rails override (either `include_partial` or `complete_replacement`) into a base `VehicleItem`.
 * Preserves the base vehicle's canonical identity (`<Folder>/<Filename>`) while applying Open Rails semantics.
 */
export function applyOpenRailsOverrideToVehicle(
  baseVehicle: VehicleItem,
  orFile: ParsedOpenRailsFile
): VehicleItem {
  const isEngine = baseVehicle.type === 'engine';
  const { presentKeys, ortsParameters } = extractOverrideSignals(orFile.overrideText);

  // Wrap partial include overrides in a synthetic Wagon/Engine envelope if they only contain loose sub-blocks
  let textToParse = orFile.overrideText;
  if (orFile.mode === 'include_partial') {
    // Strip the leading `include ( "..." )` so the parser reads the override blocks cleanly
    textToParse = textToParse.replace(/include\s*\(\s*"[^"]*"\s*\)/gi, '').replace(/include\s*\(\s*[^\s)]+\s*\)/gi, '');
    if (!/\bWagon\s*\(/i.test(textToParse)) {
      textToParse = isEngine
        ? `Wagon ( ${baseVehicle.baseFilename}\n${textToParse}\nEngine ( ${baseVehicle.baseFilename}\n${textToParse}\n)\n)`
        : `Wagon ( ${baseVehicle.baseFilename}\n${textToParse}\n)`;
    }
  }

  const parsedOverride = isEngine
    ? parseEngContent(textToParse, baseVehicle.filename, baseVehicle.folder, baseVehicle.canonicalPath)
    : parseWagContent(textToParse, baseVehicle.filename, baseVehicle.folder, baseVehicle.canonicalPath);

  const overriddenFields: string[] = [];
  const overriddenBlocks: string[] = [];

  const merged: VehicleItem = { ...baseVehicle };

  if (orFile.mode === 'complete_replacement') {
    // Complete replacement replaces all defined properties while keeping canonical ID & path
    if (parsedOverride.hasInternalName) {
      merged.name = parsedOverride.name;
      merged.hasInternalName = true;
      overriddenFields.push('Name');
    }
    if (parsedOverride.description) {
      merged.description = parsedOverride.description;
      overriddenFields.push('Description');
    }
    if (parsedOverride.hasExplicitSize && parsedOverride.dimensions) {
      merged.dimensions = parsedOverride.dimensions;
      merged.lengthMeters = parsedOverride.lengthMeters;
      merged.hasExplicitSize = true;
      overriddenFields.push('Size');
    }
    if (parsedOverride.hasExplicitMass) {
      merged.massTons = parsedOverride.massTons;
      merged.hasExplicitMass = true;
      overriddenFields.push('Mass');
    }
    if (parsedOverride.wagonShape) {
      merged.wagonShape = parsedOverride.wagonShape;
      overriddenFields.push('WagonShape');
    }
    if (parsedOverride.powerHp !== undefined) {
      merged.powerHp = parsedOverride.powerHp;
      merged.powerKw = parsedOverride.powerKw;
      overriddenFields.push('MaxPower');
    }
    if (parsedOverride.maxForceKn !== undefined) {
      merged.maxForceKn = parsedOverride.maxForceKn;
      overriddenFields.push('MaxForce');
    }
    if (parsedOverride.maxContinuousForceKn !== undefined) {
      merged.maxContinuousForceKn = parsedOverride.maxContinuousForceKn;
      overriddenFields.push('MaxContinuousForce');
    }
    if (parsedOverride.maxVelocityKmh !== undefined) {
      merged.maxVelocityKmh = parsedOverride.maxVelocityKmh;
      merged.maxVelocityRaw = parsedOverride.maxVelocityRaw;
      overriddenFields.push('MaxVelocity');
    }
    if (parsedOverride.couplings && parsedOverride.couplings.length > 0) {
      merged.couplings = parsedOverride.couplings;
      merged.couplerType = parsedOverride.couplerType;
      merged.rearCouplerType = parsedOverride.rearCouplerType;
      overriddenBlocks.push('Coupling');
    }
    if (parsedOverride.brakeSystem) {
      merged.brakeSystem = parsedOverride.brakeSystem;
      overriddenBlocks.push('BrakeSystemType');
    }
    if (parsedOverride.brakeEquipmentType) {
      merged.brakeEquipmentType = parsedOverride.brakeEquipmentType;
      overriddenBlocks.push('BrakeEquipmentType');
    }
    if (parsedOverride.sound) {
      merged.sound = parsedOverride.sound;
      overriddenBlocks.push('Sound');
    }
    if (parsedOverride.cabview) {
      merged.cabview = parsedOverride.cabview;
      overriddenBlocks.push('CabView');
    }
  } else {
    // Include-based partial override: only replace fields/blocks explicitly present in the override file
    if (presentKeys.has('name') && parsedOverride.hasInternalName) {
      merged.name = parsedOverride.name;
      merged.hasInternalName = true;
      overriddenFields.push('Name');
    }
    if (presentKeys.has('description') && parsedOverride.description) {
      merged.description = parsedOverride.description;
      overriddenFields.push('Description');
    }
    if (presentKeys.has('size') && parsedOverride.hasExplicitSize && parsedOverride.dimensions) {
      merged.dimensions = parsedOverride.dimensions;
      merged.lengthMeters = parsedOverride.lengthMeters;
      merged.hasExplicitSize = true;
      overriddenFields.push('Size');
    }
    if (presentKeys.has('mass') && parsedOverride.hasExplicitMass) {
      merged.massTons = parsedOverride.massTons;
      merged.hasExplicitMass = true;
      overriddenFields.push('Mass');
    }
    if (presentKeys.has('wagonshape') && parsedOverride.wagonShape) {
      merged.wagonShape = parsedOverride.wagonShape;
      overriddenFields.push('WagonShape');
    }
    if ((presentKeys.has('maxpower') || presentKeys.has('ortsmaxindipower')) && parsedOverride.powerHp !== undefined) {
      merged.powerHp = parsedOverride.powerHp;
      merged.powerKw = parsedOverride.powerKw;
      overriddenFields.push('MaxPower');
    }
    if (presentKeys.has('maxforce') && parsedOverride.maxForceKn !== undefined) {
      merged.maxForceKn = parsedOverride.maxForceKn;
      overriddenFields.push('MaxForce');
    }
    if (presentKeys.has('maxcontinuousforce') && parsedOverride.maxContinuousForceKn !== undefined) {
      merged.maxContinuousForceKn = parsedOverride.maxContinuousForceKn;
      overriddenFields.push('MaxContinuousForce');
    }
    if (presentKeys.has('maxvelocity') && parsedOverride.maxVelocityKmh !== undefined) {
      merged.maxVelocityKmh = parsedOverride.maxVelocityKmh;
      merged.maxVelocityRaw = parsedOverride.maxVelocityRaw;
      overriddenFields.push('MaxVelocity');
    }
    // Named block replacements per Open Rails specification
    if (presentKeys.has('coupling') && parsedOverride.couplings && parsedOverride.couplings.length > 0) {
      merged.couplings = parsedOverride.couplings;
      merged.couplerType = parsedOverride.couplerType;
      merged.rearCouplerType = parsedOverride.rearCouplerType;
      overriddenBlocks.push('Coupling');
    }
    if (presentKeys.has('brakesystemtype') && parsedOverride.brakeSystem) {
      merged.brakeSystem = parsedOverride.brakeSystem;
      overriddenBlocks.push('BrakeSystemType');
    }
    if (presentKeys.has('brakeequipmenttype') && parsedOverride.brakeEquipmentType) {
      merged.brakeEquipmentType = parsedOverride.brakeEquipmentType;
      overriddenBlocks.push('BrakeEquipmentType');
    }
    if (presentKeys.has('sound') && parsedOverride.sound) {
      merged.sound = parsedOverride.sound;
      overriddenBlocks.push('Sound');
    }
    if (presentKeys.has('cabview') && parsedOverride.cabview) {
      merged.cabview = parsedOverride.cabview;
      overriddenBlocks.push('CabView');
    }
    if (presentKeys.has('lights')) {
      overriddenBlocks.push('Lights');
    }
    if (presentKeys.has('enginecontrollers')) {
      overriddenBlocks.push('EngineControllers');
    }
  }

  const overrideInfo: OpenRailsOverrideInfo = {
    mode: orFile.mode === 'complete_replacement' ? 'complete_replacement' : 'include_partial',
    sourcePath: orFile.sourcePath,
    includeTarget: orFile.includeRawTarget,
    resolvedTargetId: baseVehicle.id,
    overriddenFields,
    overriddenBlocks,
    ortsParameters
  };

  merged.openRailsOverride = overrideInfo;
  return merged;
}
