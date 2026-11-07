/**
 * RailForge Consist - Formation-Aware Fuzzy Matcher & Recommendation Engine
 * @license Apache-2.0
 * 
 * Evaluates broken MSTS consists against Master Consist templates based on:
 * - Coach family (LHB vs ICF vs Freight)
 * - Service class (Superfast, Express, Passenger, Freight)
 * - Traction family (WAP-7, WAP-4, WDP-4, etc.)
 * - Vehicle count & coach distribution ratio
 * - Shed and keyword tokens
 */

import { ConsistFile, MasterConsist, BrokenConsistAnalysis, MissingVehicleRef, ConsistVehicleEntry } from '../types/msts';

export interface MatchScoreResult {
  masterId: string;
  score: number; // 0 - 100
  confidenceLevel: 'high' | 'medium' | 'low';
  reasons: string[];
}

/**
 * Extract tokens and intent from a broken consist
 */
export function extractConsistIntent(consist: ConsistFile): {
  coachFamily: 'LHB' | 'ICF' | 'Freight' | 'Mixed' | 'Unknown';
  serviceType: 'Superfast' | 'Express' | 'Passenger' | 'Freight' | 'Special';
  locoFamily?: string;
  shed?: string;
  keywords: string[];
  vehicleCount: number;
  hasBrakeVan: boolean;
} {
  const combined = `${consist.filename} ${consist.name} ${consist.vehicles.map(v => `${v.folder} ${v.filename}`).join(' ')}`.toUpperCase();

  // Detect Coach Family
  let coachFamily: 'LHB' | 'ICF' | 'Freight' | 'Mixed' | 'Unknown' = 'Unknown';
  const hasLhb = /LHB|RAJDHANI|SHATABDI|DURONTO|HUMSAFAR|TEJAS/i.test(combined);
  const hasIcf = /ICF|MAIL|PASSENGER|UTKRISHT|JAN.?SHATABDI/i.test(combined);
  const hasFreight = /BOXN|BCN|BTPN|FREIGHT|GOODS|CONTAINER|CONCOR/i.test(combined);

  if (hasLhb && !hasIcf && !hasFreight) coachFamily = 'LHB';
  else if (hasIcf && !hasLhb && !hasFreight) coachFamily = 'ICF';
  else if (hasFreight && !hasLhb && !hasIcf) coachFamily = 'Freight';
  else if ((hasLhb ? 1 : 0) + (hasIcf ? 1 : 0) + (hasFreight ? 1 : 0) > 1) coachFamily = 'Mixed';

  // Detect Service Type
  let serviceType: 'Superfast' | 'Express' | 'Passenger' | 'Freight' | 'Special' = 'Express';
  if (/RAJDHANI|SHATABDI|DURONTO|SUPERFAST|SF\b/i.test(combined)) {
    serviceType = 'Superfast';
  } else if (/FREIGHT|GOODS|BOXN|BCN|CONTAINER/i.test(combined)) {
    serviceType = 'Freight';
  } else if (/PASSENGER|LOCAL|SLOW|MEMU|DEMU/i.test(combined)) {
    serviceType = 'Passenger';
  } else if (/SPECIAL|INSPECTION|MILITARY/i.test(combined)) {
    serviceType = 'Special';
  } else {
    serviceType = 'Express';
  }

  // Detect Loco Family
  let locoFamily: string | undefined;
  if (/WAP-?7/i.test(combined)) locoFamily = 'WAP-7';
  else if (/WAP-?4/i.test(combined)) locoFamily = 'WAP-4';
  else if (/WAP-?5/i.test(combined)) locoFamily = 'WAP-5';
  else if (/WAG-?9/i.test(combined)) locoFamily = 'WAG-9';
  else if (/WAG-?7/i.test(combined)) locoFamily = 'WAG-7';
  else if (/WDP-?4D|WDP-?4/i.test(combined)) locoFamily = 'WDP-4';
  else if (/WDG-?4D|WDG-?4/i.test(combined)) locoFamily = 'WDG-4';
  else if (/WDM-?3/i.test(combined)) locoFamily = 'WDM-3';

  // Detect Shed
  const sheds = ['GZB', 'SRC', 'TKD', 'RPM', 'BSL', 'ED', 'BRC', 'LGD', 'KYN', 'HWH', 'VSKP'];
  let shed: string | undefined;
  for (const s of sheds) {
    if (new RegExp(`(?:\\b|_)${s}(?:\\b|_)`, 'i').test(combined)) {
      shed = s;
      break;
    }
  }

  // Keywords
  const keywords: string[] = [];
  if (coachFamily !== 'Unknown') keywords.push(coachFamily);
  keywords.push(serviceType);
  if (locoFamily) keywords.push(locoFamily);
  if (shed) keywords.push(shed);

  const hasBrakeVan = /EOG|GENERATOR|SLR|GUARD|BRAKE|CABOOSE/i.test(combined);

  return {
    coachFamily,
    serviceType,
    locoFamily,
    shed,
    keywords,
    vehicleCount: consist.vehicles.length,
    hasBrakeVan
  };
}

/**
 * Score a single Master Consist against broken consist intent
 */
export function evaluateMasterConsist(
  master: MasterConsist,
  intent: ReturnType<typeof extractConsistIntent>
): MatchScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Coach Family Match (Weight: 35 points)
  if (intent.coachFamily !== 'Unknown') {
    if (master.coachFamily === intent.coachFamily) {
      score += 35;
      reasons.push(`Identical ${intent.coachFamily} coach family (+35)`);
    } else if (master.coachFamily === 'Generic') {
      score += 15;
      reasons.push(`Compatible generic coach family (+15)`);
    } else {
      score -= 20; // Heavy penalty for cross-family mismatch (e.g. LHB vs Freight)
      reasons.push(`Mismatched coach family: wanted ${intent.coachFamily}, template is ${master.coachFamily} (-20)`);
    }
  } else {
    // If unknown, give neutral baseline
    score += 15;
  }

  // 2. Service Type Match (Weight: 25 points)
  if (master.serviceType === intent.serviceType) {
    score += 25;
    reasons.push(`Matching service type: ${intent.serviceType} (+25)`);
  } else if (
    (intent.serviceType === 'Superfast' && master.serviceType === 'Express') ||
    (intent.serviceType === 'Express' && master.serviceType === 'Superfast')
  ) {
    score += 18;
    reasons.push(`Compatible express/superfast service category (+18)`);
  } else if (intent.serviceType === 'Freight' && master.serviceType !== 'Freight') {
    score -= 30; // Do not suggest passenger for freight
    reasons.push(`Service mismatch: freight consist vs passenger template (-30)`);
  } else {
    score += 5;
  }

  // 3. Locomotive Family Match (Weight: 15 points)
  if (intent.locoFamily && master.preferredLocoFamily) {
    if (intent.locoFamily === master.preferredLocoFamily) {
      score += 15;
      reasons.push(`Preferred traction family match: ${intent.locoFamily} (+15)`);
    } else if (
      (intent.locoFamily.startsWith('WAP') && master.preferredLocoFamily.startsWith('WAP')) ||
      (intent.locoFamily.startsWith('WDP') && master.preferredLocoFamily.startsWith('WDP'))
    ) {
      score += 10;
      reasons.push(`Compatible locomotive class (${intent.locoFamily} vs ${master.preferredLocoFamily}) (+10)`);
    }
  } else if (!intent.locoFamily) {
    score += 10; // Neutral
  }

  // 4. Formation Length & Rake Proportions (Weight: 15 points)
  const countDiff = Math.abs(master.vehicleCount - intent.vehicleCount);
  if (countDiff === 0) {
    score += 15;
    reasons.push(`Exact vehicle count match (${master.vehicleCount} vehicles) (+15)`);
  } else if (countDiff <= 2) {
    score += 12;
    reasons.push(`Close vehicle count (within ${countDiff} vehicles) (+12)`);
  } else if (countDiff <= 5) {
    score += 7;
    reasons.push(`Moderate formation size difference (${countDiff} vehicles) (+7)`);
  } else {
    score -= Math.min(15, countDiff * 2);
    reasons.push(`Significant rake length difference (${countDiff} vehicles)`);
  }

  // 5. Brake Van / EOG Symmetry (Weight: 5 points)
  const masterHasBrakeVan = master.slots.some(s => s.category === 'brake_van');
  if (intent.hasBrakeVan === masterHasBrakeVan) {
    score += 5;
    reasons.push(`Matching end-vehicle EOG/SLR configuration (+5)`);
  }

  // 6. Shed & Keywords (Weight: 5 points)
  if (intent.shed && master.preferredShed && intent.shed.toUpperCase() === master.preferredShed.toUpperCase()) {
    score += 5;
    reasons.push(`Matching locomotive home shed: ${intent.shed} (+5)`);
  }

  // Normalize score between 0 and 100
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  if (normalizedScore >= 80) confidenceLevel = 'high';
  else if (normalizedScore >= 50) confidenceLevel = 'medium';

  return {
    masterId: master.id,
    score: normalizedScore,
    confidenceLevel,
    reasons
  };
}

/**
 * Analyze a broken consist and find top matching Master Consists
 */
export function analyzeBrokenConsist(
  consist: ConsistFile,
  masterConsists: MasterConsist[],
  catalogue: Map<string, any>
): BrokenConsistAnalysis {
  const missingVehicles: MissingVehicleRef[] = [];
  const availableVehicles: ConsistVehicleEntry[] = [];

  consist.vehicles.forEach((veh, idx) => {
    const ext = veh.type === 'engine' ? '.eng' : '.wag';
    const base = veh.filename.replace(/\.(eng|wag)$/i, '');
    const key = `${veh.folder}/${base}${ext}`.toLowerCase();

    let found = false;
    for (const [catKey] of catalogue) {
      if (catKey.toLowerCase() === key) {
        found = true;
        break;
      }
    }

    if (found || catalogue.size === 0) {
      availableVehicles.push({ ...veh, isMissingInTrainset: false });
    } else {
      missingVehicles.push({
        uid: veh.uid,
        filename: veh.filename,
        folder: veh.folder,
        type: veh.type
      });
      availableVehicles.push({ ...veh, isMissingInTrainset: true });
    }
  });

  const intent = extractConsistIntent(consist);

  // Score all available master consists
  const scoredMatches: MatchScoreResult[] = masterConsists.map(m => evaluateMasterConsist(m, intent));
  scoredMatches.sort((a, b) => b.score - a.score);

  const topMatch = scoredMatches[0];
  const alternatives = scoredMatches.slice(1, 4).map(m => ({
    masterId: m.masterId,
    score: m.score,
    reasons: m.reasons
  }));

  return {
    id: consist.id,
    filename: consist.filename,
    name: consist.name,
    totalVehicles: consist.vehicles.length,
    missingCount: missingVehicles.length,
    availableCount: consist.vehicles.length - missingVehicles.length,
    missingVehicles,
    availableVehicles,
    parsedConsist: consist,
    detectedCoachFamily: intent.coachFamily,
    detectedServiceType: intent.serviceType,
    detectedLocoFamily: intent.locoFamily,
    detectedKeywords: intent.keywords,
    recommendedMasterId: topMatch ? topMatch.masterId : undefined,
    confidenceScore: topMatch ? topMatch.score : 0,
    confidenceLevel: topMatch ? topMatch.confidenceLevel : 'low',
    matchReasons: topMatch ? topMatch.reasons : ['No suitable Master Consist template found.'],
    alternativeMatches: alternatives,
    recoveryStatus: 'pending'
  };
}
