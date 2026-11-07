/**
 * RailForge Consist - Master Consist Blueprint Manager
 * @license Apache-2.0
 * 
 * Manages reusable formation blueprints with slot-based architecture.
 * Automatically maps slots to real installed Trainset rolling stock.
 */

import { ConsistFile, ConsistVehicleEntry, MasterConsist, MasterConsistSlot, VehicleItem } from '../types/msts';

export const STARTER_MASTER_CONSISTS: MasterConsist[] = [
  {
    id: 'master_lhb_22_superfast',
    name: 'LHB 22-Coach Superfast Express',
    description: 'Standard Indian Railways 22-coach high-speed LHB rake hauled by WAP-7 electric locomotive.',
    stockCategory: 'LHB',
    coachFamily: 'LHB',
    serviceType: 'Superfast',
    preferredLocoFamily: 'WAP-7',
    preferredShed: 'GZB',
    keywords: ['LHB', 'Superfast', 'WAP-7', 'Express', '22-coach', 'Rajdhani', 'GZB'],
    vehicleCount: 22,
    isStarterTemplate: true,
    updatedAt: Date.now(),
    slots: [
      { id: 's0', label: 'Lead Locomotive (WAP-7)', expectedType: 'engine', category: 'locomotive', preferredSubCategory: 'WAP-7' },
      { id: 's1', label: 'Front Generator Car (EOG)', expectedType: 'wagon', category: 'brake_van', preferredSubCategory: 'LHB EOG' },
      { id: 's2', label: 'LHB AC 2-Tier (2A)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB AC 2-Tier' },
      { id: 's3', label: 'LHB AC 2-Tier (2A)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB AC 2-Tier' },
      { id: 's4', label: 'LHB AC 3-Tier (3A)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB AC 3-Tier' },
      { id: 's5', label: 'LHB AC 3-Tier (3A)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB AC 3-Tier' },
      { id: 's6', label: 'LHB AC 3-Tier (3A)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB AC 3-Tier' },
      { id: 's7', label: 'LHB Pantry Car (PC)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Pantry' },
      { id: 's8', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's9', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's10', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's11', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's12', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's13', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's14', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's15', label: 'LHB Sleeper Class (SL)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB Sleeper' },
      { id: 's16', label: 'LHB General Class (GS)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB General' },
      { id: 's17', label: 'LHB General Class (GS)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB General' },
      { id: 's18', label: 'LHB General Class (GS)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB General' },
      { id: 's19', label: 'LHB General Class (GS)', expectedType: 'wagon', category: 'passenger_lhb', preferredSubCategory: 'LHB General' },
      { id: 's20', label: 'Rear Generator Car (EOG)', expectedType: 'wagon', category: 'brake_van', preferredSubCategory: 'LHB EOG' }
    ]
  },
  {
    id: 'master_icf_24_express',
    name: 'ICF 24-Coach Mail / Express',
    description: 'Classic blue ICF Mail and Express formation with WAP-4 locomotive, sleeper coaches and dual SLR guard vans.',
    stockCategory: 'ICF',
    coachFamily: 'ICF',
    serviceType: 'Express',
    preferredLocoFamily: 'WAP-4',
    preferredShed: 'SRC',
    keywords: ['ICF', 'Mail', 'Express', 'WAP-4', 'SRC', 'Blue'],
    vehicleCount: 22,
    isStarterTemplate: true,
    updatedAt: Date.now(),
    slots: [
      { id: 'icf_s0', label: 'Lead Locomotive (WAP-4)', expectedType: 'engine', category: 'locomotive', preferredSubCategory: 'WAP-4' },
      { id: 'icf_s1', label: 'Front Guard & Luggage (SLR)', expectedType: 'wagon', category: 'brake_van', preferredSubCategory: 'ICF SLR' },
      { id: 'icf_s2', label: 'ICF General Second (GS)', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF General' },
      { id: 'icf_s3', label: 'ICF General Second (GS)', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF General' },
      { id: 'icf_s4', label: 'ICF AC 2-Tier', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF AC 2-Tier' },
      { id: 'icf_s5', label: 'ICF AC 3-Tier', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF AC 3-Tier' },
      { id: 'icf_s6', label: 'ICF AC 3-Tier', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF AC 3-Tier' },
      { id: 'icf_s7', label: 'ICF Pantry Car', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Pantry' },
      { id: 'icf_s8', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s9', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s10', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s11', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s12', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s13', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s14', label: 'ICF Sleeper Class', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF Sleeper' },
      { id: 'icf_s15', label: 'ICF General Second', expectedType: 'wagon', category: 'passenger_icf', preferredSubCategory: 'ICF General' },
      { id: 'icf_s16', label: 'Rear Guard & Luggage (SLR)', expectedType: 'wagon', category: 'brake_van', preferredSubCategory: 'ICF SLR' }
    ]
  },
  {
    id: 'master_boxn_freight',
    name: 'BOXN Heavy Freight Rake',
    description: 'Heavy coal/iron-ore freight train hauled by WAG-9 heavy electric freight locomotive.',
    stockCategory: 'Freight',
    coachFamily: 'Freight',
    serviceType: 'Freight',
    preferredLocoFamily: 'WAG-9',
    keywords: ['BOXN', 'Freight', 'Goods', 'WAG-9', 'Coal'],
    vehicleCount: 20,
    isStarterTemplate: true,
    updatedAt: Date.now(),
    slots: [
      { id: 'fr_s0', label: 'Lead Locomotive (WAG-9)', expectedType: 'engine', category: 'locomotive', preferredSubCategory: 'WAG-9' },
      ...Array.from({ length: 18 }, (_, i) => ({
        id: `fr_boxn_${i}`,
        label: `BOXN Open Wagon #${i + 1}`,
        expectedType: 'wagon' as const,
        category: 'freight_wagon' as const,
        preferredSubCategory: 'BOXN'
      })),
      { id: 'fr_bv', label: 'Freight Brake Van', expectedType: 'wagon', category: 'brake_van', preferredSubCategory: 'Brake Van' }
    ]
  }
];

/**
 * Bind or resolve installed vehicles to a Master Consist's slots
 */
export function resolveMasterConsistSlots(
  master: MasterConsist,
  catalogue: Map<string, VehicleItem>
): {
  slotsWithStock: Array<{
    slot: MasterConsistSlot;
    vehicle?: VehicleItem;
    status: 'resolved' | 'missing' | 'unassigned';
    recommendedReplacements: VehicleItem[];
  }>;
  resolvedPercentage: number;
} {
  const catItems = Array.from(catalogue.values());
  let resolvedCount = 0;

  const slotsWithStock = master.slots.map(slot => {
    // 1. Check if explicitly assigned vehicle exists in catalogue
    let boundVehicle: VehicleItem | undefined;
    if (slot.assignedVehicleId && catalogue.has(slot.assignedVehicleId)) {
      boundVehicle = catalogue.get(slot.assignedVehicleId);
    }

    // 2. Find recommended installed replacements
    const candidates = catItems.filter(v => {
      if (v.type !== slot.expectedType) return false;
      if (slot.category && v.category !== slot.category && slot.category !== 'special') {
        return false;
      }
      return true;
    });

    // Score candidates by subCategory match
    candidates.sort((a, b) => {
      const pref = (slot.preferredSubCategory || '').toLowerCase();
      const aMatch = a.subCategory.toLowerCase().includes(pref) ? 2 : 0;
      const bMatch = b.subCategory.toLowerCase().includes(pref) ? 2 : 0;
      return bMatch - aMatch;
    });

    // If not bound, auto-bind top candidate
    if (!boundVehicle && candidates.length > 0) {
      boundVehicle = candidates[0];
    }

    const status: 'resolved' | 'missing' | 'unassigned' = boundVehicle
      ? 'resolved'
      : candidates.length > 0
      ? 'missing'
      : 'unassigned';

    if (status === 'resolved') {
      resolvedCount++;
    }

    return {
      slot,
      vehicle: boundVehicle,
      status,
      recommendedReplacements: candidates.slice(0, 5)
    };
  });

  const resolvedPercentage = master.slots.length > 0
    ? Math.round((resolvedCount / master.slots.length) * 100)
    : 0;

  return { slotsWithStock, resolvedPercentage };
}

/**
 * Convert a resolved Master Consist into an active ConsistFile
 */
export function buildConsistFromMaster(
  master: MasterConsist,
  catalogue: Map<string, VehicleItem>,
  customName?: string
): ConsistFile {
  const { slotsWithStock } = resolveMasterConsistSlots(master, catalogue);
  const vehicles: ConsistVehicleEntry[] = [];

  slotsWithStock.forEach((item, index) => {
    const veh = item.vehicle;
    if (veh) {
      vehicles.push({
        uid: index,
        vehicleId: veh.id,
        filename: veh.baseFilename,
        folder: veh.folder,
        name: veh.name,
        type: veh.type,
        flipDirection: !!item.slot.flipDirection,
        category: veh.category,
        subCategory: veh.subCategory,
        lengthMeters: veh.lengthMeters,
        massTons: veh.massTons
      });
    } else {
      // Create schematic slot representation
      const isEngine = item.slot.expectedType === 'engine';
      vehicles.push({
        uid: index,
        vehicleId: `placeholder_${item.slot.id}`,
        filename: item.slot.preferredSubCategory?.replace(/\s+/g, '_') || 'Vehicle',
        folder: 'TRAINSET',
        name: item.slot.label,
        type: item.slot.expectedType,
        flipDirection: !!item.slot.flipDirection,
        category: item.slot.category,
        subCategory: item.slot.preferredSubCategory || 'Generic',
        lengthMeters: isEngine ? 20.5 : 22.0,
        massTons: isEngine ? 120 : 48,
        isMissingInTrainset: true
      });
    }
  });

  const name = customName || master.name;
  const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.con`;

  return {
    id: filename.toLowerCase().replace(/\.con$/i, ''),
    filename,
    name,
    maxVelocityMps: master.serviceType === 'Superfast' ? 44.44444 : 36.11111,
    durability: 1.0,
    serial: 1,
    nextWagonUid: vehicles.length,
    vehicles
  };
}
