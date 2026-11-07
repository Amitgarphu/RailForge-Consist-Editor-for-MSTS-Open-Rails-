/**
 * RailForge Consist - Core MSTS, Open Rails & TSRE5 Workstation Data Types
 * @license Apache-2.0
 */

export type VehicleKind = 'engine' | 'wagon';

export type TractionClass = 'electric' | 'diesel' | 'steam' | 'none';

export type StockCategory = 
  | 'locomotive'
  | 'passenger_lhb'
  | 'passenger_icf'
  | 'passenger_standard'
  | 'freight_wagon'
  | 'brake_van'
  | 'special';

export type ServiceType = 
  | 'Superfast' 
  | 'Express' 
  | 'Passenger' 
  | 'Freight' 
  | 'Special';

export type ViewportDisplayMode =
  | 'selected_vehicle'
  | 'selected_consist_unit'
  | 'full_consist';

export interface VehicleDimensions {
  width: number;
  height: number;
  length: number;
}

export interface CouplingSpec {
  type: string; // e.g. 'Automatic', 'Chain', 'Bar'
  springStiffness?: string;
  damping?: string;
  breakForce?: string;
  r0?: string;
}

export interface OpenRailsOverrideInfo {
  mode: 'include_partial' | 'complete_replacement';
  sourcePath: string; // e.g. "TRAINSET/WAP7_GZB/OpenRails/WAP7_30201.eng"
  includeTarget?: string; // e.g. "../WAP7_30201.eng" or "[[SameName]]"
  resolvedTargetId: string;
  overriddenFields: string[];
  overriddenBlocks: string[];
  ortsParameters: Record<string, string>;
}

export type TextureDiagnosticState =
  | 'assigned_to_material'
  | 'decoded'
  | 'found'
  | 'unsupported_dds_format'
  | 'invalid_texture'
  | 'missing';

export interface TextureAssetStatus {
  filename: string; // Original reference in .S shape, e.g. "WAP7_body.ace" or "WAP7_body"
  resolvedFilename?: string; // Actual file resolved in folder, e.g. "WAP7_body.dds"
  resolutionMethod?: 'exact_match' | 'extensionless_dds_first' | 'extensionless_ace_fallback' | 'openrails_alt_extension';
  foundInFolder: boolean;
  loaded: boolean; // Decoded successfully
  assignedToMaterial?: boolean; // Bound to a Three.js mesh material
  diagnosticState?: TextureDiagnosticState;
  containerType?: 'ACE' | 'DDS';
  format?:
    | 'RGB24'
    | 'RGBA32'
    | 'ALPHA1'
    | 'DXT1'
    | 'DXT3'
    | 'DXT5'
    | 'DDS_RGBA8'
    | 'DDS_RGB8'
    | 'UNSUPPORTED_DDS'
    | 'UNSUPPORTED';
  width?: number;
  height?: number;
  mipmapCount?: number;
  hasAlpha?: boolean;
  hasTrans?: boolean;
  colorSpace?: 'srgb' | 'linear';
  error?: string;
}

export interface VehicleAssetDiagnostics {
  shapeFilename?: string; // from WagonShape ( "..." )
  shapeFound: boolean;
  shapeLoaded: boolean;
  shapeCompression?: 'uncompressed' | 'zlib_compressed';
  shapeRepresentation?: 'text' | 'binary' | 'unknown';
  shapeJinxSignature?: string;
  lodCount?: number;
  vertexCount?: number;
  triangleCount?: number;
  matrixCount?: number;
  sdFilename?: string;
  sdFound: boolean;
  esdBoundingBox?: [number, number, number, number, number, number];
  esdAlternativeTexture?: number;
  texturesReferenced: string[];
  textureStatuses: TextureAssetStatus[];
  texturesFoundCount: number;
  texturesLoadedCount: number;
  missingTextures: string[];
  unsupportedFeatures: string[];
  invalidReferences: string[];
  renderMode: 'authentic_shape_textured' | 'authentic_shape_untextured' | 'parametric_fallback';
}

export interface VehicleItem {
  id: string; // Canonical key: e.g. "WAP7_GZB/WAP7_30201.eng"
  canonicalPath: string; // Full relative path from TRAINSET: e.g. "TRAINSET/WAP7_GZB/WAP7_30201.eng"
  filename: string; // e.g. "WAP7_30201.eng"
  baseFilename: string; // "WAP7_30201" (without extension)
  folder: string; // Parent folder in TRAINSET, e.g. "WAP7_GZB"
  name: string; // Display name from internal Name ( "..." ) or fallback to baseFilename
  hasInternalName: boolean; // True if Name ( "..." ) was explicitly present in file
  description?: string; // Internal Description ( "..." ) if present
  type: VehicleKind;
  engineTypeRaw?: string; // Raw Type ( Electric | Diesel | Steam ) inside Engine block
  wagonTypeRaw?: string; // Raw Type ( Engine | Freight | Passenger | Carriage | Tender ) inside Wagon block
  tractionType: TractionClass;
  category: StockCategory;
  subCategory: string; // e.g. "LHB AC 2T", "LHB EOG", "BOXN", "WAP-7"
  dimensions?: VehicleDimensions; // Parsed from Size ( W H L )
  hasExplicitSize?: boolean;
  lengthMeters: number;
  massTons: number;
  hasExplicitMass?: boolean;
  powerHp?: number;
  powerKw?: number;
  maxForceKn?: number;
  maxContinuousForceKn?: number;
  maxVelocityKmh?: number;
  maxVelocityRaw?: string;
  wagonShape?: string; // e.g. "WAP7_30201.s"
  sound?: string;
  cabview?: string;
  couplerType?: string; // Primary/Front coupler type
  rearCouplerType?: string; // Rear coupler if two Coupling blocks exist
  couplings?: CouplingSpec[];
  brakeSystem?: string; // BrakeSystemType ( "..." )
  brakeEquipmentType?: string; // BrakeEquipmentType ( "..." )
  adheasion?: string;
  shed?: string;
  rawTokens: string[];
  parsingStatus: 'valid' | 'warning' | 'malformed';
  parseWarnings?: string[];
  fileEncoding?: 'utf16le' | 'utf16be' | 'ascii_utf8';
  contentHash?: string; // FNV-1a / SHA fingerprint of raw source content
  isDuplicateContent?: boolean;
  duplicateOfIds?: string[]; // Other <Folder>/<Filename> entries with identical contentHash
  isVariant?: boolean; // True if AI, Trail, Dead, Helper, or NoLight variant
  variantKind?: 'AI' | 'Trail' | 'Dead' | 'Helper' | 'Flipped' | 'NoLight';
  familyPrimaryId?: string; // Points to the primary vehicle ID in the same folder
  familyVariantIds?: string[]; // Populated on the primary vehicle
  openRailsOverride?: OpenRailsOverrideInfo;
  assetDiagnostics?: VehicleAssetDiagnostics;
  isManualOverride?: boolean;
}

export interface ConsistVehicleEntry {
  uid: number; // MSTS UiD ( 0, 1, ... )
  vehicleId: string; // Canonical "<folder>/<filename>.(eng|wag)"
  filename: string; // base filename without extension, e.g. "WAP7_30201"
  folder: string; // folder name in TRAINSET, e.g. "WAP7_GZB"
  name: string; // display name
  type: VehicleKind;
  flipDirection: boolean;
  category: StockCategory;
  subCategory: string;
  lengthMeters: number;
  massTons: number;
  isMissingInTrainset?: boolean;
}

export interface ConsistFile {
  id: string; // Canonical consist ID
  filename: string; // e.g. "SRC_LHB_Express.con"
  name: string; // TrainCfg Name ( "..." )
  trainCfgId?: string; // First string inside TrainCfg ( "..."
  maxVelocityMps: number; // e.g. 44.44444 (~160 km/h)
  accelerationFactor?: number; // Second value in MaxVelocity ( 44.44444 1.00000 )
  durability: number;
  serial: number;
  nextWagonUid: number;
  vehicles: ConsistVehicleEntry[];
  rawText?: string;
  sourcePath?: string; // e.g. "CONSISTS/SRC_LHB_Express.con"
  missingCount?: number;
  duplicateUidCount?: number;
  isValid?: boolean;
}

export interface MasterConsistSlot {
  id: string;
  label: string;
  expectedType: VehicleKind;
  category: StockCategory;
  preferredSubCategory?: string;
  assignedVehicleId?: string;
  flipDirection?: boolean;
  isOptional?: boolean;
}

export interface MasterConsist {
  id: string;
  name: string;
  description: string;
  stockCategory: 'LHB' | 'ICF' | 'Freight' | 'Mixed' | 'Global';
  coachFamily: 'LHB' | 'ICF' | 'Generic' | 'Freight';
  serviceType: ServiceType;
  preferredLocoFamily?: string;
  preferredShed?: string;
  keywords: string[];
  slots: MasterConsistSlot[];
  vehicleCount: number;
  isStarterTemplate?: boolean;
  updatedAt: number;
  notes?: string;
}

export interface MissingVehicleRef {
  uid: number;
  filename: string;
  folder: string;
  type: VehicleKind;
}

export interface BrokenConsistAnalysis {
  id: string;
  filename: string;
  name: string;
  totalVehicles: number;
  missingCount: number;
  availableCount: number;
  missingVehicles: MissingVehicleRef[];
  availableVehicles: ConsistVehicleEntry[];
  parsedConsist: ConsistFile;
  detectedCoachFamily: 'LHB' | 'ICF' | 'Freight' | 'Mixed' | 'Unknown';
  detectedServiceType: ServiceType;
  detectedLocoFamily?: string;
  detectedKeywords: string[];
  recommendedMasterId?: string;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  matchReasons: string[];
  alternativeMatches: { masterId: string; score: number; reasons: string[] }[];
  recoveryStatus: 'pending' | 'applied' | 'exported';
  repairedConsist?: ConsistFile;
}

export interface ScanDiagnosticEntry {
  canonicalPath: string;
  classification:
    | 'primary_vehicle'
    | 'variant_vehicle'
    | 'openrails_override_partial'
    | 'openrails_override_replacement'
    | 'duplicate_content'
    | 'invalid_definition';
  details: string;
}

export interface TrainsetScanStats {
  selectedPath: string;
  consistsPath?: string;
  totalFilesExamined: number;
  engFilesDiscovered: number;
  wagFilesDiscovered: number;
  rawSourceDefinitionsCount: number; // Total valid top-level ENG + WAG definitions
  logicalVehicleFamiliesCount: number; // Primary vehicles excluding grouped AI/Trail/Dead variants
  openRailsOverridesMergedCount: number; // OpenRails/ include or replacement files merged
  variantDefinitionsCount: number; // AI / Trail / Dead / Helper variants (retained in lookup)
  duplicateFilesCount: number; // Files with identical contentHash across folders
  invalidCount: number; // Malformed or unsupported ENG/WAG files
  conFilesDiscovered: number;
  validConsistsCount: number;
  brokenConsistsCount: number;
  lastScannedTime: number;
  diagnosticLog: ScanDiagnosticEntry[];
}
