/**
 * RailForge Consist - Vehicle Classifier
 * @license Apache-2.0
 * 
 * Accurately classifies MSTS rolling stock based on parsed ENG/WAG metadata,
 * internal vehicle tokens, and filenames.
 */

import { StockCategory, TractionClass, VehicleItem, VehicleKind } from '../types/msts';

export interface ClassificationResult {
  category: StockCategory;
  tractionType: TractionClass;
  subCategory: string;
  shed?: string;
  coachFamily?: 'LHB' | 'ICF' | 'Freight' | 'Generic';
}

const SHED_NAMES = [
  'GZB', 'SRC', 'TKD', 'RPM', 'BSL', 'ED', 'BRC', 'LGD', 'AQ', 'BNDM',
  'KYN', 'MGS', 'CNB', 'HWH', 'SGUJ', 'VSKP', 'BZA', 'KJM', 'UBL', 'SBI',
  'RTM', 'ET', 'JHS', 'GD', 'AMV', 'NKJ', 'AJJ', 'TATA', 'KZJ', 'MDU'
];

/**
 * Detect Indian Railway shed acronyms from name/path tokens
 */
export function extractShed(text: string): string | undefined {
  const upper = text.toUpperCase();
  for (const shed of SHED_NAMES) {
    const regex = new RegExp(`(?:\\b|_)${shed}(?:\\b|_)`, 'i');
    if (regex.test(upper)) {
      return shed;
    }
  }
  return undefined;
}

/**
 * Classify an engine or wagon based on its parsed attributes and filename
 */
export function classifyVehicle(
  type: VehicleKind,
  filename: string,
  folder: string,
  internalName?: string,
  engineType?: string,
  wagonType?: string,
  wagonShape?: string
): ClassificationResult {
  const combined = `${filename} ${folder} ${internalName || ''} ${wagonShape || ''}`.toUpperCase();
  const shed = extractShed(combined);

  // 1. LOCOMOTIVES
  if (type === 'engine') {
    let traction: TractionClass = 'diesel';
    const engLower = (engineType || '').toLowerCase();

    if (engLower.includes('electric') || /WAP|WAG|WAM|WCAM|ELECTRIC|AEM-7|E60|ACS-64|BB|CC/i.test(combined)) {
      traction = 'electric';
    } else if (engLower.includes('steam') || /STEAM|DAMPF|WP|WG|PACIFIC|HUDSON|2-8-2|4-6-2/i.test(combined)) {
      traction = 'steam';
    } else {
      traction = 'diesel';
    }

    // Specific Locomotive Family
    let subCategory = 'Locomotive';
    if (/WAP-?7/i.test(combined)) subCategory = 'WAP-7 Electric';
    else if (/WAP-?4/i.test(combined)) subCategory = 'WAP-4 Electric';
    else if (/WAP-?5/i.test(combined)) subCategory = 'WAP-5 Electric';
    else if (/WAG-?9/i.test(combined)) subCategory = 'WAG-9 Heavy Freight';
    else if (/WAG-?7/i.test(combined)) subCategory = 'WAG-7 Freight';
    else if (/WAG-?12/i.test(combined)) subCategory = 'WAG-12 Twin Electric';
    else if (/WDP-?4D|WDP-?4B|WDP-?4/i.test(combined)) subCategory = 'WDP-4 Series Diesel';
    else if (/WDG-?4D|WDG-?4/i.test(combined)) subCategory = 'WDG-4 Freight Diesel';
    else if (/WDM-?3D|WDM-?3A|WDM-?2/i.test(combined)) subCategory = 'WDM-3 Series Alco';
    else if (traction === 'electric') subCategory = 'Electric Locomotive';
    else if (traction === 'diesel') subCategory = 'Diesel Locomotive';
    else if (traction === 'steam') subCategory = 'Steam Locomotive';

    return {
      category: 'locomotive',
      tractionType: traction,
      subCategory,
      shed
    };
  }

  // 2. WAGONS & PASSENGER COACHES
  // Check Brake Van / EOG / Guard Caboose
  if (/EOG|GENERATOR|POWER.?CAR/i.test(combined)) {
    const isLhb = /LHB|RED|HUMSAFAR|TEJAS/i.test(combined);
    return {
      category: 'brake_van',
      tractionType: 'none',
      subCategory: isLhb ? 'LHB EOG Generator Car' : 'Generator Car',
      coachFamily: isLhb ? 'LHB' : 'Generic',
      shed
    };
  }

  if (/SLR|GUARD|BRAKE.?VAN|CABOOSE|FOURGON/i.test(combined)) {
    const isIcf = /ICF|BLUE|UTKRISHT/i.test(combined);
    const isLhb = /LHB|RED/i.test(combined);
    return {
      category: 'brake_van',
      tractionType: 'none',
      subCategory: isLhb ? 'LHB SLR Guard Van' : isIcf ? 'ICF SLR Guard Van' : 'Brake Van',
      coachFamily: isLhb ? 'LHB' : isIcf ? 'ICF' : 'Generic',
      shed
    };
  }

  // Check LHB Passenger Coaches
  if (/LHB/i.test(combined) || /RAJDHANI|SHATABDI|DURONTO|GARIB.?RATH|HUMSAFAR|TEJAS/i.test(combined)) {
    let subCategory = 'LHB Coach';
    if (/AC1|1A|H1|FIRST.?AC/i.test(combined)) subCategory = 'LHB AC First Class (1A)';
    else if (/AC2|2A|A1|A2|TWO.?TIER/i.test(combined)) subCategory = 'LHB AC 2-Tier (2A)';
    else if (/AC3|3A|B1|B2|B3|B4|THREE.?TIER/i.test(combined)) subCategory = 'LHB AC 3-Tier (3A)';
    else if (/3E|ECONOMY/i.test(combined)) subCategory = 'LHB 3-Tier Economy (3E)';
    else if (/SL|SLEEPER|S1|S2|S3/i.test(combined)) subCategory = 'LHB Sleeper Class (SL)';
    else if (/GS|GEN|GENERAL|UNRESERVED|DEEN/i.test(combined)) subCategory = 'LHB General Class (GS)';
    else if (/PC|PANTRY|BUFFET/i.test(combined)) subCategory = 'LHB Pantry Car (PC)';
    else if (/CC|CHAIR|EXECUTIVE|EC/i.test(combined)) subCategory = 'LHB Chair Car (CC)';

    return {
      category: 'passenger_lhb',
      tractionType: 'none',
      subCategory,
      coachFamily: 'LHB',
      shed
    };
  }

  // Check ICF Passenger Coaches
  if (/ICF/i.test(combined) || /MAIL|EXPRESS|JAN.?SHATABDI|PASSENGER/i.test(combined) || /GS|SL|WGACCW|WGSCN/i.test(combined)) {
    let subCategory = 'ICF Coach';
    if (/WGACCW|AC2|2A/i.test(combined)) subCategory = 'ICF AC 2-Tier';
    else if (/WGACCN|AC3|3A/i.test(combined)) subCategory = 'ICF AC 3-Tier';
    else if (/WGSCN|SL|SLEEPER/i.test(combined)) subCategory = 'ICF Sleeper Class';
    else if (/GS|GENERAL|II|SECOND/i.test(combined)) subCategory = 'ICF General Second Class';
    else if (/WCB|PANTRY/i.test(combined)) subCategory = 'ICF Pantry Car';
    else if (/WSCZ|CHAIR/i.test(combined)) subCategory = 'ICF Chair Car';

    return {
      category: 'passenger_icf',
      tractionType: 'none',
      subCategory,
      coachFamily: 'ICF',
      shed
    };
  }

  // Check Freight Wagons
  if (/BOXN|BCN|BTPN|BCNHL|BOBRN|CONCOR|CONTAINER|FLAT|HOPPER|TANK|GONDOLA|GOODS|FREIGHT/i.test(combined)) {
    let subCategory = 'Freight Wagon';
    if (/BOXN/i.test(combined)) subCategory = 'BOXN Open Gondola';
    else if (/BCN/i.test(combined)) subCategory = 'BCN Covered Goods';
    else if (/BTPN|TANK/i.test(combined)) subCategory = 'BTPN Petroleum Tanker';
    else if (/CONCOR|CONTAINER|BLCA|BLCB/i.test(combined)) subCategory = 'Container Flat Wagon';
    else if (/BOBRN/i.test(combined)) subCategory = 'BOBRN Rapid Hopper';

    return {
      category: 'freight_wagon',
      tractionType: 'none',
      subCategory,
      coachFamily: 'Freight',
      shed
    };
  }

  // Generic Passenger fallback if coach/passenger mentioned
  if (/COACH|PASSENGER|WAGON|CAR/i.test(combined) || (wagonType && wagonType.toLowerCase() === 'passenger')) {
    return {
      category: 'passenger_standard',
      tractionType: 'none',
      subCategory: 'Standard Passenger Coach',
      coachFamily: 'Generic',
      shed
    };
  }

  // Default fallback
  return {
    category: 'special',
    tractionType: 'none',
    subCategory: 'Rolling Stock',
    coachFamily: 'Generic',
    shed
  };
}
