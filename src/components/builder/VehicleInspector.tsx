/**
 * RailForge Consist - Right-Side Technical Inspector (TSRE5 Vehicle & Asset Diagnostics)
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import {
  ConsistFile,
  ConsistVehicleEntry,
  StockCategory,
  VehicleItem,
  TextureDiagnosticState
} from '../../types/msts';
import {
  Save,
  Download,
  RefreshCw,
  Box,
  Image as ImageIcon,
  FileText
} from 'lucide-react';

interface VehicleInspectorProps {
  consist: ConsistFile;
  selectedVehicle: ConsistVehicleEntry | null;
  selectedVehicleIndex?: number | null;
  selectedVehicleItem?: VehicleItem;
  selectedLibraryVehicle?: VehicleItem | null;
  activeInspectionSource?: 'library' | 'consist_unit';
  onReplaceSelectedUnit?: (replacement: VehicleItem) => void;
  onUpdateConsistName: (name: string) => void;
  onUpdateVehicleCategory: (newCategory: StockCategory, newSubCategory: string) => void;
  onSaveAsMaster: () => void;
  onExportCon: () => void;
}

function getTextureStateBadge(state?: TextureDiagnosticState): {
  label: string;
  colorClass: string;
} {
  switch (state) {
    case 'assigned_to_material':
      return {
        label: 'Assigned to material',
        colorClass: 'bg-[#69BD91]/15 text-[#69BD91] border-[#69BD91]/30'
      };
    case 'decoded':
      return {
        label: 'Decoded',
        colorClass: 'bg-[#79A997]/15 text-[#79A997] border-[#79A997]/30'
      };
    case 'found':
      return {
        label: 'Found',
        colorClass: 'bg-[#929DA9]/15 text-[#929DA9] border-[#929DA9]/30'
      };
    case 'unsupported_dds_format':
      return {
        label: 'Unsupported DDS format',
        colorClass: 'bg-[#D6A85B]/15 text-[#D6A85B] border-[#D6A85B]/30'
      };
    case 'missing':
      return {
        label: 'Missing',
        colorClass: 'bg-[#D87575]/15 text-[#D87575] border-[#D87575]/30'
      };
    case 'invalid_texture':
    default:
      return {
        label: 'Invalid texture',
        colorClass: 'bg-[#D87575]/20 text-[#D87575] border-[#D87575]/40'
      };
  }
}

export const VehicleInspector: React.FC<VehicleInspectorProps> = ({
  consist,
  selectedVehicle,
  selectedVehicleIndex = null,
  selectedVehicleItem,
  selectedLibraryVehicle = null,
  activeInspectionSource = 'library',
  onReplaceSelectedUnit,
  onUpdateConsistName,
  onSaveAsMaster,
  onExportCon
}) => {
  const [inspectorTab, setInspectorTab] = useState<'vehicle' | 'consist'>('vehicle');

  const totalLength = Math.round(
    consist.vehicles.reduce((sum, v) => sum + (v.lengthMeters || 22), 0)
  );
  const totalWeight = Math.round(
    consist.vehicles.reduce((sum, v) => sum + (v.massTons || 48), 0)
  );
  const engineCount = consist.vehicles.filter((v) => v.type === 'engine').length;
  const wagonCount = consist.vehicles.length - engineCount;

  const inspectedItem: VehicleItem | undefined =
    activeInspectionSource === 'library' && selectedLibraryVehicle
      ? selectedLibraryVehicle
      : selectedVehicleItem || selectedLibraryVehicle || undefined;

  const displayTitle = inspectedItem?.name || selectedVehicle?.name || 'No Vehicle Selected';
  const displayFolder = inspectedItem?.folder || selectedVehicle?.folder || '-';
  const displayFile =
    inspectedItem?.filename ||
    (selectedVehicle
      ? `${selectedVehicle.filename}.${selectedVehicle.type === 'engine' ? 'eng' : 'wag'}`
      : '-');
  const displayType = inspectedItem?.type || selectedVehicle?.type || 'wagon';
  const lengthM = inspectedItem?.lengthMeters || selectedVehicle?.lengthMeters || 22.0;
  const widthM = inspectedItem?.dimensions?.width || 3.15;
  const heightM = inspectedItem?.dimensions?.height || 4.15;
  const massT = inspectedItem?.massTons || selectedVehicle?.massTons || 48;

  const assetDiag = inspectedItem?.assetDiagnostics;

  return (
    <div className="flex flex-col h-full bg-[#14191F] border-l border-[#252D36] select-none overflow-hidden">
      {/* Top Mode Switcher: Vehicle Inspector vs Consist Overview */}
      <div className="grid grid-cols-2 border-b border-[#252D36] bg-[#0E1115] shrink-0">
        <button
          onClick={() => setInspectorTab('vehicle')}
          className={`py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
            inspectorTab === 'vehicle'
              ? 'border-[#79A997] text-[#E8EDF2] bg-[#14191F]'
              : 'border-transparent text-[#65717E] hover:text-[#929DA9]'
          }`}
        >
          Vehicle Inspector
        </button>

        <button
          onClick={() => setInspectorTab('consist')}
          className={`py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
            inspectorTab === 'consist'
              ? 'border-[#79A997] text-[#E8EDF2] bg-[#14191F]'
              : 'border-transparent text-[#65717E] hover:text-[#929DA9]'
          }`}
        >
          Consist & Export
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {inspectorTab === 'vehicle' ? (
          inspectedItem || selectedVehicle ? (
            <div className="p-3 space-y-4">
              {/* Source Badge & Replace Selected Unit Callout */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#79A997]/15 text-[#79A997]">
                    {displayType === 'engine' ? 'Locomotive (.ENG)' : 'Rolling Stock (.WAG)'}
                  </span>

                  {inspectedItem?.hasInternalName === false && (
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#D6A85B]/15 text-[#D6A85B]"
                      title="No internal Name() field found in file; displaying filename fallback"
                    >
                      Filename Fallback
                    </span>
                  )}

                  {inspectedItem?.isVariant && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#D6A85B]/15 text-[#D6A85B]">
                      {inspectedItem.variantKind || 'Variant'}
                    </span>
                  )}
                </div>

                <div className="text-sm font-semibold text-[#E8EDF2] leading-snug">
                  {displayTitle}
                </div>

                {/* TSRE5 Replace Selected Unit Action */}
                {selectedVehicleIndex !== null &&
                  selectedVehicle &&
                  selectedLibraryVehicle &&
                  onReplaceSelectedUnit && (
                    <button
                      onClick={() => onReplaceSelectedUnit(selectedLibraryVehicle)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors shadow"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="truncate">
                        Replace Unit #{selectedVehicleIndex + 1} with {selectedLibraryVehicle.filename}
                      </span>
                    </button>
                  )}
              </div>

              {/* 1. Source Identity & File Paths */}
              <div className="space-y-1.5 pt-2.5 border-t border-[#252D36] text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#65717E] flex items-center gap-1">
                  <FileText className="w-3 h-3 text-[#79A997]" />
                  <span>Source Identity</span>
                </span>

                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36] space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#65717E] shrink-0">Filename:</span>
                    <span className="text-[#E8EDF2] truncate" title={displayFile}>
                      {displayFile}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#65717E] shrink-0">Folder:</span>
                    <span className="text-[#79A997] truncate" title={displayFolder}>
                      {displayFolder}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#65717E] shrink-0">Canonical Key:</span>
                    <span
                      className="text-[#929DA9] truncate"
                      title={inspectedItem?.id || `${displayFolder}/${displayFile}`}
                    >
                      {inspectedItem?.id || `${displayFolder}/${displayFile}`}
                    </span>
                  </div>
                  {inspectedItem?.contentHash && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#65717E] shrink-0">Content Hash:</span>
                      <span className="text-[#65717E]">{inspectedItem.contentHash}</span>
                    </div>
                  )}
                </div>

                {/* Duplicate Content Hash Alert (Preserved as distinct folder identity) */}
                {inspectedItem?.isDuplicateContent && (
                  <div className="p-2 bg-[#D6A85B]/10 border border-[#D6A85B]/30 rounded text-[11px] text-[#D6A85B]">
                    Identical file content hash to{' '}
                    <code className="font-mono">
                      {inspectedItem.duplicateOfIds?.[0] || 'another folder'}
                    </code>
                    . Preserved as separate folder identity for exact .CON compatibility.
                  </div>
                )}

                {/* OpenRails Subfolder Override Info */}
                {inspectedItem?.openRailsOverride && (
                  <div className="p-2 bg-[#69BD91]/10 border border-[#69BD91]/30 rounded space-y-1 text-[11px]">
                    <div className="font-semibold text-[#69BD91]">
                      OpenRails Subfolder Override Active (
                      {inspectedItem.openRailsOverride.mode === 'include_partial'
                        ? 'Include Partial Merge'
                        : 'Complete Replacement'}
                      )
                    </div>
                    <div className="font-mono text-[10px] text-[#929DA9] break-all">
                      Source: {inspectedItem.openRailsOverride.sourcePath}
                    </div>
                    {inspectedItem.openRailsOverride.overriddenBlocks.length > 0 && (
                      <div className="text-[10px] text-[#E8EDF2]">
                        Replaced blocks:{' '}
                        <span className="font-mono text-[#79A997]">
                          {inspectedItem.openRailsOverride.overriddenBlocks.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Physical Dimensions & Performance Telemetry */}
              <div className="space-y-2 pt-2.5 border-t border-[#252D36] text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#65717E] block">
                  Dimensions & Traction Physics
                </span>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                    <span className="text-[9px] text-[#65717E] uppercase block">Length</span>
                    <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold">
                      {lengthM.toFixed(2)}m
                    </span>
                  </div>
                  <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                    <span className="text-[9px] text-[#65717E] uppercase block">Width</span>
                    <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold">
                      {widthM.toFixed(2)}m
                    </span>
                  </div>
                  <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                    <span className="text-[9px] text-[#65717E] uppercase block">Height</span>
                    <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold">
                      {heightM.toFixed(2)}m
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                    <span className="text-[9px] text-[#65717E] uppercase block">Mass</span>
                    <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold">
                      {massT} t
                    </span>
                  </div>
                  <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                    <span className="text-[9px] text-[#65717E] uppercase block">Max Speed</span>
                    <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                      {inspectedItem?.maxVelocityKmh || 130} km/h
                    </span>
                  </div>

                  {(inspectedItem?.powerKw || inspectedItem?.powerHp) && (
                    <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                      <span className="text-[9px] text-[#65717E] uppercase block">Max Power</span>
                      <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                        {inspectedItem.powerKw ? `${inspectedItem.powerKw} kW` : ''}{' '}
                        {inspectedItem.powerHp ? `(${inspectedItem.powerHp} hp)` : ''}
                      </span>
                    </div>
                  )}

                  {inspectedItem?.maxForceKn && (
                    <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                      <span className="text-[9px] text-[#65717E] uppercase block">
                        Tractive Force
                      </span>
                      <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold">
                        {inspectedItem.maxForceKn} kN
                        {inspectedItem.maxContinuousForceKn
                          ? ` / ${inspectedItem.maxContinuousForceKn} kN cont`
                          : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Couplers, Brakes & Audio/Cab Config */}
                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36] space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#65717E]">Coupling:</span>
                    <span className="text-[#E8EDF2]">
                      {inspectedItem?.couplings && inspectedItem.couplings.length > 0
                        ? inspectedItem.couplings.map((c) => c.type).join(' · ')
                        : inspectedItem?.couplerType || 'Automatic'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#65717E]">Brake System:</span>
                    <span className="text-[#929DA9] truncate">
                      {inspectedItem?.brakeSystem || 'Air_single_pipe'}
                    </span>
                  </div>
                  {inspectedItem?.brakeEquipmentType && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#65717E]">Brake Equip:</span>
                      <span className="text-[#929DA9] truncate max-w-[165px]">
                        {inspectedItem.brakeEquipmentType}
                      </span>
                    </div>
                  )}
                  {inspectedItem?.cabview && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#65717E]">CabView:</span>
                      <span className="text-[#929DA9] truncate">{inspectedItem.cabview}</span>
                    </div>
                  )}
                  {inspectedItem?.sound && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#65717E]">Sound:</span>
                      <span className="text-[#929DA9] truncate">{inspectedItem.sound}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. MSTS .S / .SD Shape & Mandatory .DDS / .ACE Texture Diagnostics */}
              <div className="space-y-2 pt-2.5 border-t border-[#252D36] text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#65717E] flex items-center gap-1">
                  <Box className="w-3 h-3 text-[#79A997]" />
                  <span>3D Shape (.S/.SD) & Texture (.DDS/.ACE) Diagnostics</span>
                </span>

                <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36] space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-[#65717E]">WagonShape (.S):</span>
                    <span className="text-[#E8EDF2] font-semibold">
                      {inspectedItem?.wagonShape || `${displayFile}.s`}
                    </span>
                  </div>

                  {assetDiag ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[#65717E]">SIMISA Format:</span>
                        <span className="text-[#79A997]">
                          {assetDiag.shapeCompression
                            ? `${assetDiag.shapeCompression} / ${assetDiag.shapeRepresentation}`
                            : assetDiag.renderMode}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#65717E]">Geometry Status:</span>
                        <span
                          className={
                            assetDiag.shapeLoaded ? 'text-[#69BD91]' : 'text-[#D6A85B]'
                          }
                        >
                          {assetDiag.shapeLoaded
                            ? `Parsed (${assetDiag.vertexCount || 0} verts, ${
                                assetDiag.triangleCount || 0
                              } tris)`
                            : assetDiag.shapeFound
                            ? 'Found (Unparsed)'
                            : 'Missing'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#65717E]">Shape Desc (.SD):</span>
                        <span className="text-[#929DA9]">
                          {assetDiag.sdFound
                            ? `${assetDiag.sdFilename || '.sd'} (Loaded)`
                            : 'Not present'}
                        </span>
                      </div>

                      {/* Individual Texture Diagnostics List (.DDS and .ACE) */}
                      <div className="pt-2 border-t border-[#252D36]/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-[#65717E] uppercase">
                          <span className="flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-[#79A997]" />
                            <span>
                              Referenced Textures ({assetDiag.textureStatuses.length})
                            </span>
                          </span>
                          <span>DDS / ACE</span>
                        </div>

                        {assetDiag.textureStatuses.length === 0 ? (
                          <div className="text-[10px] text-[#65717E] py-1">
                            No external texture references in shape header.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-0.5">
                            {assetDiag.textureStatuses.map((tex, idx) => {
                              const badge = getTextureStateBadge(tex.diagnosticState);
                              return (
                                <div
                                  key={`${tex.filename}_${idx}`}
                                  className="p-1.5 bg-[#14191F] rounded border border-[#252D36] space-y-1 text-[10px]"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className="text-[#E8EDF2] font-semibold truncate"
                                      title={`Referenced: ${tex.filename}${
                                        tex.resolvedFilename
                                          ? ` -> Resolved: ${tex.resolvedFilename}`
                                          : ''
                                      }`}
                                    >
                                      {tex.resolvedFilename || tex.filename}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded border text-[9px] font-sans font-semibold shrink-0 ${badge.colorClass}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-[#929DA9] text-[9px]">
                                    <span>
                                      Fmt:{' '}
                                      <strong className="text-[#79A997]">
                                        {tex.format || tex.containerType || 'N/A'}
                                      </strong>
                                      {tex.width && tex.height
                                        ? ` · ${tex.width}×${tex.height}`
                                        : ''}
                                      {tex.mipmapCount && tex.mipmapCount > 1
                                        ? ` · ${tex.mipmapCount} mips`
                                        : ''}
                                      {tex.hasAlpha ? ' · Alpha' : ''}
                                    </span>
                                    {tex.resolutionMethod && (
                                      <span className="text-[#65717E]">
                                        {tex.resolutionMethod === 'extensionless_dds_first'
                                          ? '.dds priority'
                                          : tex.resolutionMethod === 'openrails_alt_extension'
                                          ? 'OR alt-ext'
                                          : 'exact'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-[#65717E] font-sans leading-relaxed">
                      Scan your <code className="text-[#79A997] font-mono">TRAINSET</code> directory
                      to inspect SIMISA .S geometry and per-material .DDS / .ACE texture diagnostics.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-[#65717E]">
              Select a vehicle in the Rolling Stock Inventory or click a unit in the Formation
              Timeline to inspect its technical properties.
            </div>
          )
        ) : (
          /* Consist Overview & Export Tab */
          <div className="p-3 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#929DA9]">
                Consist Display Name
              </label>
              <input
                type="text"
                value={consist.name}
                onChange={(e) => onUpdateConsistName(e.target.value)}
                className="w-full bg-[#0E1115] border border-[#252D36] text-xs text-[#E8EDF2] rounded p-2 focus:border-[#79A997] focus:outline-none font-medium"
              />
              <div className="text-[11px] font-mono text-[#65717E]">
                Output file: {consist.filename}
              </div>
            </div>

            {/* Rake Telemetry */}
            <div className="space-y-2 pt-2 border-t border-[#252D36]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#65717E] block">
                Train Formation Telemetry
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                  <span className="text-[10px] text-[#65717E] block">Total Units</span>
                  <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold text-sm">
                    {consist.vehicles.length}
                  </span>
                </div>
                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                  <span className="text-[10px] text-[#65717E] block">Total Length</span>
                  <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold text-sm">
                    {totalLength} m
                  </span>
                </div>
                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                  <span className="text-[10px] text-[#65717E] block">Gross Weight</span>
                  <span className="font-mono tabular-nums text-[#E8EDF2] font-semibold text-sm">
                    {totalWeight} t
                  </span>
                </div>
                <div className="bg-[#0E1115] p-2 rounded border border-[#252D36]">
                  <span className="text-[10px] text-[#65717E] block">Max Speed</span>
                  <span className="font-mono tabular-nums text-[#79A997] font-semibold text-sm">
                    {Math.round(consist.maxVelocityMps * 3.6)} km/h
                  </span>
                </div>
              </div>

              <div className="text-[11px] font-mono text-[#929DA9] space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>Locomotives (.ENG):</span>
                  <span className="text-[#E8EDF2]">{engineCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Coaches / Wagons (.WAG):</span>
                  <span className="text-[#E8EDF2]">{wagonCount}</span>
                </div>
              </div>
            </div>

            {/* Safe Export & Master Template Actions */}
            <div className="pt-3 border-t border-[#252D36] space-y-2">
              <button
                onClick={onSaveAsMaster}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-semibold transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save as Master Consist</span>
              </button>

              <button
                onClick={onExportCon}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-semibold transition-colors shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Safe .CON Copy</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
