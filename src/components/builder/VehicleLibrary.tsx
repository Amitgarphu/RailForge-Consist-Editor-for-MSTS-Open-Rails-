/**
 * RailForge Consist - Dual-Inventory Left Panel (Rolling Stock & Consists Browser)
 * @license Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { VehicleItem, ConsistFile } from '../../types/msts';
import {
  Search,
  Plus,
  SlidersHorizontal,
  FolderOpen,
  Train,
  Layers,
  ArrowLeftRight,
  GitBranch
} from 'lucide-react';

interface VehicleLibraryProps {
  vehicles: VehicleItem[];
  consists?: ConsistFile[];
  selectedLibraryVehicleId?: string | null;
  selectedConsistUnitIndex?: number | null;
  activeConsistId?: string;
  onSelectLibraryVehicle: (vehicle: VehicleItem) => void;
  onAddVehicle: (vehicle: VehicleItem) => void;
  onReplaceSelectedUnit?: (vehicle: VehicleItem) => void;
  onSelectConsistFile?: (consist: ConsistFile) => void;
  trainsetLoaded: boolean;
  onOpenFolderSetup: () => void;
}

export const VehicleLibrary: React.FC<VehicleLibraryProps> = ({
  vehicles,
  consists = [],
  selectedLibraryVehicleId,
  selectedConsistUnitIndex = null,
  activeConsistId,
  onSelectLibraryVehicle,
  onAddVehicle,
  onReplaceSelectedUnit,
  onSelectConsistFile,
  trainsetLoaded,
  onOpenFolderSetup
}) => {
  const [inventoryTab, setInventoryTab] = useState<'rolling_stock' | 'consists'>('rolling_stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'engine' | 'wagon'>('all');
  const [tractionFilter, setTractionFilter] = useState<string>('all');
  const [couplerFilter, setCouplerFilter] = useState<string>('all');
  const [brakeFilter, setBrakeFilter] = useState<string>('all');
  const [showVariants, setShowVariants] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const variantCount = useMemo(() => vehicles.filter((v) => v.isVariant).length, [vehicles]);
  const primaryCount = useMemo(() => vehicles.filter((v) => !v.isVariant).length, [vehicles]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (!showVariants && v.isVariant && !searchQuery.trim()) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = v.name.toLowerCase().includes(query);
        const matchFile = v.filename.toLowerCase().includes(query);
        const matchFolder = v.folder.toLowerCase().includes(query);
        const matchSub = v.subCategory.toLowerCase().includes(query);
        const matchShape = (v.wagonShape || '').toLowerCase().includes(query);
        if (!matchName && !matchFile && !matchFolder && !matchSub && !matchShape) {
          return false;
        }
      }

      if (fileTypeFilter !== 'all' && v.type !== fileTypeFilter) {
        return false;
      }

      if (categoryFilter !== 'all') {
        if (categoryFilter === 'loco' && v.type !== 'engine') return false;
        if (
          categoryFilter === 'lhb' &&
          v.category !== 'passenger_lhb' &&
          !v.name.toUpperCase().includes('LHB')
        )
          return false;
        if (
          categoryFilter === 'icf' &&
          v.category !== 'passenger_icf' &&
          !v.name.toUpperCase().includes('ICF')
        )
          return false;
        if (categoryFilter === 'freight' && v.category !== 'freight_wagon') return false;
        if (categoryFilter === 'brake' && v.category !== 'brake_van') return false;
      }

      if (tractionFilter !== 'all') {
        if (v.tractionType.toLowerCase() !== tractionFilter.toLowerCase()) return false;
      }

      if (couplerFilter !== 'all') {
        const cType = (v.couplings?.[0]?.type || v.couplerType || '').toLowerCase();
        if (!cType.includes(couplerFilter.toLowerCase())) return false;
      }

      if (brakeFilter !== 'all') {
        const bType = (v.brakeSystem || '').toLowerCase();
        if (!bType.includes(brakeFilter.toLowerCase())) return false;
      }

      return true;
    });
  }, [
    vehicles,
    showVariants,
    searchQuery,
    fileTypeFilter,
    categoryFilter,
    tractionFilter,
    couplerFilter,
    brakeFilter
  ]);

  const filteredConsists = useMemo(() => {
    if (!searchQuery.trim()) return consists;
    const q = searchQuery.toLowerCase();
    return consists.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.filename.toLowerCase().includes(q) ||
        c.vehicles.some(
          (v) => v.name.toLowerCase().includes(q) || v.filename.toLowerCase().includes(q)
        )
    );
  }, [consists, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-[#14191F] border-r border-[#252D36] select-none">
      {/* Dual-Inventory Switcher Tabs */}
      <div className="grid grid-cols-2 border-b border-[#252D36] bg-[#0E1115]">
        <button
          onClick={() => setInventoryTab('rolling_stock')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
            inventoryTab === 'rolling_stock'
              ? 'border-[#79A997] text-[#E8EDF2] bg-[#14191F]'
              : 'border-transparent text-[#65717E] hover:text-[#929DA9]'
          }`}
        >
          <Train className="w-3.5 h-3.5 text-[#79A997]" />
          <span>Rolling Stock</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#1A2028] text-[#79A997]">
            {primaryCount}
          </span>
        </button>

        <button
          onClick={() => setInventoryTab('consists')}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-[11px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
            inventoryTab === 'consists'
              ? 'border-[#79A997] text-[#E8EDF2] bg-[#14191F]'
              : 'border-transparent text-[#65717E] hover:text-[#929DA9]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-[#929DA9]" />
          <span>Consists (.CON)</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[#1A2028] text-[#929DA9]">
            {consists.length}
          </span>
        </button>
      </div>

      {/* Search & Filter Header */}
      <div className="p-2.5 border-b border-[#252D36] space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#65717E]" />
            <input
              type="text"
              placeholder={
                inventoryTab === 'rolling_stock'
                  ? 'Search Name, .ENG/.WAG, Folder, .S...'
                  : 'Search .CON filename or display name...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 bg-[#0E1115] border border-[#252D36] focus:border-[#79A997] rounded text-xs text-[#E8EDF2] placeholder-[#65717E] focus:outline-none transition-colors"
            />
          </div>

          {inventoryTab === 'rolling_stock' && (
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              title="Toggle Technical Property Filters (Coupler, Brakes, Traction)"
              className={`p-1.5 rounded border transition-colors ${
                showAdvancedFilters
                  ? 'bg-[#79A997]/20 border-[#79A997] text-[#79A997]'
                  : 'bg-[#0E1115] border-[#252D36] text-[#929DA9] hover:text-[#E8EDF2]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {inventoryTab === 'rolling_stock' && (
          <>
            {/* Quick Category Pills */}
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'loco', label: 'Locos' },
                { id: 'lhb', label: 'LHB' },
                { id: 'icf', label: 'ICF' },
                { id: 'freight', label: 'Freight' },
                { id: 'brake', label: 'EOG/SLR' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    categoryFilter === tab.id
                      ? 'bg-[#1A2028] text-[#79A997] border border-[#252D36]'
                      : 'text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028]/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Variant Grouping Toggle & Count Summary */}
            <div className="flex items-center justify-between text-[10px] pt-0.5">
              <button
                onClick={() => setShowVariants(!showVariants)}
                className={`flex items-center gap-1 font-mono transition-colors ${
                  showVariants ? 'text-[#79A997]' : 'text-[#65717E] hover:text-[#929DA9]'
                }`}
                title="AI, Trail, Dead, and Helper ENG/WAG definitions are preserved for .CON compatibility and grouped under their primary vehicle."
              >
                <GitBranch className="w-3 h-3" />
                <span>
                  {showVariants
                    ? `Showing all (${vehicles.length} raw)`
                    : `Hide ${variantCount} AI/Trail variants`}
                </span>
              </button>

              <span className="font-mono text-[#65717E] tabular-nums">
                {filteredVehicles.length} shown
              </span>
            </div>

            {/* Expandable Technical Filters */}
            {showAdvancedFilters && (
              <div className="p-2 bg-[#0E1115] border border-[#252D36] rounded space-y-2 text-[11px]">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[9px] uppercase text-[#65717E] block mb-0.5">
                      Definition Type
                    </label>
                    <select
                      value={fileTypeFilter}
                      onChange={(e) => setFileTypeFilter(e.target.value as any)}
                      className="w-full bg-[#14191F] border border-[#252D36] rounded px-1.5 py-1 text-[11px] text-[#E8EDF2]"
                    >
                      <option value="all">All (.ENG & .WAG)</option>
                      <option value="engine">Engines (.ENG)</option>
                      <option value="wagon">Wagons (.WAG)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] uppercase text-[#65717E] block mb-0.5">
                      Traction
                    </label>
                    <select
                      value={tractionFilter}
                      onChange={(e) => setTractionFilter(e.target.value)}
                      className="w-full bg-[#14191F] border border-[#252D36] rounded px-1.5 py-1 text-[11px] text-[#E8EDF2]"
                    >
                      <option value="all">All Traction</option>
                      <option value="electric">Electric</option>
                      <option value="diesel">Diesel</option>
                      <option value="steam">Steam</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] uppercase text-[#65717E] block mb-0.5">
                      Coupler Type
                    </label>
                    <select
                      value={couplerFilter}
                      onChange={(e) => setCouplerFilter(e.target.value)}
                      className="w-full bg-[#14191F] border border-[#252D36] rounded px-1.5 py-1 text-[11px] text-[#E8EDF2]"
                    >
                      <option value="all">Any Coupler</option>
                      <option value="automatic">Automatic (CBC)</option>
                      <option value="bar">Bar</option>
                      <option value="chain">Chain (Screw)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] uppercase text-[#65717E] block mb-0.5">
                      Brake System
                    </label>
                    <select
                      value={brakeFilter}
                      onChange={(e) => setBrakeFilter(e.target.value)}
                      className="w-full bg-[#14191F] border border-[#252D36] rounded px-1.5 py-1 text-[11px] text-[#E8EDF2]"
                    >
                      <option value="all">Any Brake System</option>
                      <option value="air_twin">Air Twin Pipe</option>
                      <option value="air_single">Air Single Pipe</option>
                      <option value="vacuum">Vacuum</option>
                      <option value="ep">EP Brake</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Main List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#252D36]/40">
        {inventoryTab === 'rolling_stock' ? (
          !trainsetLoaded || vehicles.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <FolderOpen className="w-7 h-7 text-[#79A997] mx-auto opacity-80" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#E8EDF2]">
                  TRAINSET Directory Not Loaded
                </div>
                <div className="text-[11px] text-[#65717E] leading-relaxed">
                  Select your local <code className="text-[#79A997] font-mono">TRAINS\TRAINSET</code>{' '}
                  or parent <code className="text-[#79A997] font-mono">TRAINS</code> folder to scan
                  authentic .ENG and .WAG rolling stock. No fake sample vehicles are generated.
                </div>
              </div>
              <button
                onClick={onOpenFolderSetup}
                className="px-3.5 py-2 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors shadow"
              >
                Select TRAINSET / TRAINS Folder
              </button>
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#65717E]">
              No rolling stock matches the active filters.
            </div>
          ) : (
            filteredVehicles.map((veh) => {
              const isEngine = veh.type === 'engine';
              const isSelected = selectedLibraryVehicleId === veh.id;
              const childVariantsCount = veh.familyVariantIds?.length || 0;

              return (
                <div
                  key={veh.id}
                  onClick={() => onSelectLibraryVehicle(veh)}
                  className={`group p-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#1A2028] border-l-2 border-l-[#79A997]'
                      : 'hover:bg-[#1A2028]/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1 rounded ${
                            isEngine
                              ? 'bg-[#79A997]/15 text-[#79A997]'
                              : 'bg-[#252D36] text-[#929DA9]'
                          }`}
                        >
                          {isEngine ? veh.tractionType : veh.subCategory || 'Wagon'}
                        </span>

                        {veh.isVariant && (
                          <span className="text-[9px] font-mono px-1 rounded bg-[#D6A85B]/15 text-[#D6A85B]">
                            {veh.variantKind || 'Variant'}
                          </span>
                        )}

                        {veh.openRailsOverride && (
                          <span
                            className="text-[9px] font-mono px-1 rounded bg-[#69BD91]/15 text-[#69BD91]"
                            title={`OpenRails subfolder override merged (${veh.openRailsOverride.mode})`}
                          >
                            OR
                          </span>
                        )}

                        {childVariantsCount > 0 && !showVariants && (
                          <span
                            className="text-[9px] font-mono px-1 rounded bg-[#252D36] text-[#929DA9]"
                            title={`${childVariantsCount} AI/Trail/Helper variants grouped under this vehicle`}
                          >
                            +{childVariantsCount} var
                          </span>
                        )}
                      </div>

                      <div
                        className="text-xs font-semibold text-[#E8EDF2] truncate mt-1"
                        title={veh.name}
                      >
                        {veh.name}
                      </div>

                      <div
                        className="text-[11px] text-[#65717E] font-mono truncate mt-0.5"
                        title={`${veh.folder}/${veh.filename}`}
                      >
                        {veh.folder}/{veh.filename}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-[#929DA9] mt-1 font-mono tabular-nums">
                        <span>{veh.lengthMeters.toFixed(1)}m</span>
                        <span>·</span>
                        <span>{veh.massTons}t</span>
                        {veh.couplerType && (
                          <>
                            <span>·</span>
                            <span>{veh.couplerType}</span>
                          </>
                        )}
                        {veh.powerHp && (
                          <>
                            <span>·</span>
                            <span className="text-[#79A997]">{veh.powerHp}hp</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons: Replace Unit #N & Append */}
                    <div
                      className="flex flex-col items-end gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAddVehicle(veh)}
                        title="Append Vehicle to Active Consist"
                        className="px-2 py-1 text-[10px] font-semibold text-[#929DA9] hover:text-[#090B0D] bg-[#0E1115] hover:bg-[#79A997] border border-[#252D36] rounded transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>

                      {selectedConsistUnitIndex !== null && onReplaceSelectedUnit && (
                        <button
                          onClick={() => onReplaceSelectedUnit(veh)}
                          title={`Replace Unit #${selectedConsistUnitIndex + 1} in active consist with ${veh.name}`}
                          className="px-2 py-1 text-[10px] font-semibold text-[#79A997] hover:text-[#090B0D] bg-[#79A997]/10 hover:bg-[#79A997] border border-[#79A997]/40 rounded transition-colors flex items-center gap-1"
                        >
                          <ArrowLeftRight className="w-2.5 h-2.5" />
                          <span>Repl #{selectedConsistUnitIndex + 1}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : filteredConsists.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <Layers className="w-7 h-7 text-[#929DA9] mx-auto opacity-75" />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#E8EDF2]">No .CON Consists Loaded</div>
              <div className="text-[11px] text-[#65717E] leading-relaxed">
                Select your <code className="text-[#79A997] font-mono">TRAINS\CONSISTS</code> or
                parent <code className="text-[#79A997] font-mono">TRAINS</code> directory to browse
                and edit installed .CON files.
              </div>
            </div>
            <button
              onClick={onOpenFolderSetup}
              className="px-3 py-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-semibold transition-colors"
            >
              Configure CONSISTS Folder
            </button>
          </div>
        ) : (
          filteredConsists.map((con) => {
            const isCurrent = activeConsistId === con.id;
            const leadUnit = con.vehicles[0];
            const totalLen = Math.round(
              con.vehicles.reduce((sum, v) => sum + (v.lengthMeters || 22), 0)
            );

            return (
              <div
                key={con.id}
                onClick={() => onSelectConsistFile && onSelectConsistFile(con)}
                className={`p-2.5 cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-[#1A2028] border-l-2 border-l-[#79A997]'
                    : 'hover:bg-[#1A2028]/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold text-[#E8EDF2] truncate"
                    title={con.name}
                  >
                    {con.name}
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#0E1115] border border-[#252D36] text-[#79A997] shrink-0">
                    {con.vehicles.length} units
                  </span>
                </div>

                <div className="text-[11px] font-mono text-[#65717E] truncate mt-0.5">
                  {con.filename}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#929DA9] mt-1">
                  <span className="truncate max-w-[175px]">
                    Lead: {leadUnit ? leadUnit.name || leadUnit.filename : 'None'}
                  </span>
                  <span>{totalLen}m</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
