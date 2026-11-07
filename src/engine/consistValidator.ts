/**
 * RailForge Consist - Consist Syntax & Integrity Validator
 * @license Apache-2.0
 */

import { ConsistFile, VehicleItem } from '../types/msts';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  vehicleIndex?: number;
}

export interface ValidationReport {
  isValid: boolean;
  canExport: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  missingVehicles: { index: number; filename: string; folder: string }[];
}

export function validateConsist(
  consist: ConsistFile,
  trainsetCatalogue: Map<string, VehicleItem>
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const infos: ValidationIssue[] = [];
  const missingVehicles: { index: number; filename: string; folder: string }[] = [];

  // 1. Vehicle presence
  if (consist.vehicles.length === 0) {
    errors.push({
      severity: 'error',
      message: 'Consist has no vehicles. At least one locomotive or wagon is required.'
    });
  }

  // 2. Locomotive presence
  const hasEngine = consist.vehicles.some(v => v.type === 'engine');
  if (!hasEngine) {
    warnings.push({
      severity: 'warning',
      message: 'Consist has no locomotive. This formation cannot move under its own power.'
    });
  }

  // 3. Sequential UIDs and missing stock resolution
  const uidSet = new Set<number>();
  consist.vehicles.forEach((veh, idx) => {
    // Check UID uniqueness
    if (uidSet.has(veh.uid)) {
      warnings.push({
        severity: 'warning',
        message: `Duplicate UiD (${veh.uid}) detected at position ${idx + 1}. Will be normalized during export.`,
        vehicleIndex: idx
      });
    }
    uidSet.add(veh.uid);

    // Check trainset resolution
    const ext = veh.type === 'engine' ? '.eng' : '.wag';
    const base = veh.filename.replace(/\.(eng|wag)$/i, '');
    const lookupKey = `${veh.folder}/${base}${ext}`.toLowerCase();

    // Check case-insensitive match in catalogue
    let resolved = false;
    for (const [catKey] of trainsetCatalogue) {
      if (catKey.toLowerCase() === lookupKey) {
        resolved = true;
        break;
      }
    }

    if (!resolved && trainsetCatalogue.size > 0) {
      missingVehicles.push({
        index: idx,
        filename: veh.filename,
        folder: veh.folder
      });
      warnings.push({
        severity: 'warning',
        message: `Vehicle "${veh.filename}" in folder "${veh.folder}" was not found in installed Trainset.`,
        vehicleIndex: idx
      });
    }
  });

  // 4. EOG / Guard Van check for passenger rakes
  const isPassenger = consist.vehicles.some(
    v => v.category === 'passenger_lhb' || v.category === 'passenger_icf'
  );
  if (isPassenger && consist.vehicles.length >= 8) {
    const hasBrakeVan = consist.vehicles.some(v => v.category === 'brake_van');
    if (!hasBrakeVan) {
      infos.push({
        severity: 'info',
        message: 'No EOG Generator car or Guard SLR van found in passenger rake.'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    canExport: errors.length === 0,
    errors,
    warnings,
    infos,
    missingVehicles
  };
}
