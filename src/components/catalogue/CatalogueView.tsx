/**
 * RailForge Consist - Full Rolling Stock Catalogue & Six-Tier Audit View
 * @license Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { VehicleItem, TrainsetScanStats } from '../../types/msts';
import {
  Search,
  GitBranch,
  Box
} from 'lucide-react';

interface CatalogueViewProps {
  vehicles: VehicleItem[];
  scanStats?: TrainsetScanStats | null;
  onAddVehicleToConsist: (vehicle: VehicleItem) => void;
  onInspectVehicleIn3D?: (vehicle: VehicleItem) => void;
  onOpenFolderSetup: () => void;
}

export const CatalogueView: React.FC<CatalogueViewProps> = ({
  vehicles,
  scanStats,
  onAddVehicleToConsist,
  onInspectVehicleIn3D,
  onOpenFolderSetup
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showVariants, setShowVariants] = useState(false);

  const stats = useMemo(() => {
    let primary = 0;
    let variants = 0;
    let locos = 0;
    let lhb = 0;
    let icf = 0;
    let freight = 0;
    let brake = 0;
    let orOverrides = 0;
    let hashDuplicates = 0;

    vehicles.forEach((v) => {
      if (v.isVariant) variants++;
      else primary++;

      if (v.openRailsOverride) orOverrides++;
      if (v.isDuplicateContent) hashDuplicates++;

      if (!v.isVariant || showVariants) {
        if (v.type === 'engine') locos++;
        else if (v.category === 'passenger_lhb' || v.name.toUpperCase().includes('LHB')) lhb++;
        else if (v.category === 'passenger_icf' || v.name.toUpperCase().includes('ICF')) icf++;
        else if (v.category === 'freight_wagon') freight++;
        else if (v.category === 'brake_van') brake++;
      }
    });

    return {
      primary,
      variants,
      rawTotal: vehicles.length,
      locos,
      lhb,
      icf,
      freight,
      brake,
      orOverrides: scanStats?.openRailsOverridesMergedCount ?? orOverrides,
      hashDuplicates: scanStats?.duplicateFilesCount ?? hashDuplicates
    };
  }, [vehicles, showVariants, scanStats]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (!showVariants && v.isVariant && !search.trim()) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          v.name.toLowerCase().includes(q) ||
          v.filename.toLowerCase().includes(q) ||
          v.folder.toLowerCase().includes(q) ||
          v.subCategory.toLowerCase().includes(q) ||
          (v.wagonShape || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      if (categoryFilter === 'locos') return v.type === 'engine';
      if (categoryFilter === 'lhb')
        return v.category === 'passenger_lhb' || v.name.toUpperCase().includes('LHB');
      if (categoryFilter === 'icf')
        return v.category === 'passenger_icf' || v.name.toUpperCase().includes('ICF');
      if (categoryFilter === 'freight') return v.category === 'freight_wagon';
      if (categoryFilter === 'brake') return v.category === 'brake_van';

      return true;
    });
  }, [vehicles, showVariants, search, categoryFilter]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0E1115] overflow-hidden select-none">
      {/* Header & Six-Tier Accounting Banner */}
      <div className="p-5 bg-[#14191F] border-b border-[#252D36] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-[#E8EDF2] tracking-wide">
              TRAINSET ROLLING STOCK INVENTORY
            </h2>
            <p className="text-xs text-[#929DA9] mt-0.5">
              Authentic inventory of installed .ENG and .WAG rolling stock (strictly separated from
              .CON consists, templates, and OpenRails overrides).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVariants(!showVariants)}
              className={`px-3 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showVariants
                  ? 'bg-[#79A997]/20 border-[#79A997] text-[#79A997]'
                  : 'bg-[#1A2028] border-[#252D36] text-[#929DA9] hover:text-[#E8EDF2]'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>
                {showVariants
                  ? `Showing All Raw Definitions (${stats.rawTotal})`
                  : `Grouping ${stats.variants} AI/Trail Variants`}
              </span>
            </button>

            <button
              onClick={onOpenFolderSetup}
              className="px-3 py-1.5 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors"
            >
              Configure Directories
            </button>
          </div>
        </div>

        {/* Six-Tier Inventory Accounting Grid */}
        <div className="grid grid-cols-6 gap-2.5">
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">
              Logical Primary Stock
            </span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#79A997]">
              {stats.primary}
            </span>
          </div>
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">
              Raw .ENG/.WAG Files
            </span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#E8EDF2]">
              {stats.rawTotal}
            </span>
          </div>
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">
              OpenRails Overrides
            </span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#69BD91]">
              {stats.orOverrides}
            </span>
          </div>
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">
              AI / Trail Variants
            </span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#D6A85B]">
              {stats.variants}
            </span>
          </div>
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">Locomotives</span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#E8EDF2]">
              {stats.locos}
            </span>
          </div>
          <div className="bg-[#0E1115] p-2.5 rounded border border-[#252D36]">
            <span className="text-[10px] text-[#65717E] uppercase block">
              Cross-Folder Hash Dupes
            </span>
            <span className="font-mono tabular-nums text-lg font-bold text-[#929DA9]">
              {stats.hashDuplicates}
            </span>
          </div>
        </div>

        {/* Search & Filter Strip */}
        <div className="flex items-center gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#65717E]" />
            <input
              type="text"
              placeholder="Search by Display Name, .ENG/.WAG filename, Folder, or .S Shape..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#0E1115] border border-[#252D36] focus:border-[#79A997] rounded text-xs text-[#E8EDF2] placeholder-[#65717E] focus:outline-none font-medium"
            />
          </div>

          <div className="flex gap-1 bg-[#0E1115] p-1 rounded border border-[#252D36]">
            {[
              { id: 'all', label: 'All Stock' },
              { id: 'locos', label: 'Locomotives' },
              { id: 'lhb', label: 'LHB' },
              { id: 'icf', label: 'ICF' },
              { id: 'freight', label: 'Freight' },
              { id: 'brake', label: 'EOG / SLR' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  categoryFilter === f.id
                    ? 'bg-[#1A2028] text-[#79A997] shadow-sm'
                    : 'text-[#929DA9] hover:text-[#E8EDF2]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* High-Density Data Grid Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#14191F] border-b border-[#252D36] sticky top-0 z-10 text-[#65717E] font-mono uppercase text-[10px]">
            <tr>
              <th className="py-2.5 px-4 font-semibold">Display Name</th>
              <th className="py-2.5 px-4 font-semibold">Filename</th>
              <th className="py-2.5 px-4 font-semibold">Folder</th>
              <th className="py-2.5 px-4 font-semibold">Type / Role</th>
              <th className="py-2.5 px-4 font-semibold text-right">Size (L×W×H)</th>
              <th className="py-2.5 px-4 font-semibold text-right">Mass</th>
              <th className="py-2.5 px-4 font-semibold">Shape & Textures (.S/.DDS/.ACE)</th>
              <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#252D36]/40 font-mono text-[11px]">
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[#65717E] font-sans">
                  {vehicles.length === 0
                    ? 'No TRAINSET directory loaded yet. Click "Configure Directories" above to scan your MSTS/Open Rails rolling stock.'
                    : 'No vehicles found matching current filter criteria.'}
                </td>
              </tr>
            ) : (
              filteredVehicles.map((veh) => {
                const isEngine = veh.type === 'engine';
                const diag = veh.assetDiagnostics;
                const texAssigned =
                  diag?.textureStatuses.filter((t) => t.diagnosticState === 'assigned_to_material')
                    .length || 0;
                const texTotal = diag?.textureStatuses.length || 0;

                return (
                  <tr key={veh.id} className="hover:bg-[#1A2028] transition-colors group">
                    <td
                      className="py-2.5 px-4 font-sans font-semibold text-[#E8EDF2] max-w-[220px] truncate"
                      title={veh.name}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{veh.name}</span>
                        {veh.openRailsOverride && (
                          <span className="text-[9px] font-mono px-1 rounded bg-[#69BD91]/15 text-[#69BD91] shrink-0">
                            OR
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-[#929DA9]">{veh.filename}</td>
                    <td className="py-2.5 px-4 text-[#65717E]">{veh.folder}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            isEngine
                              ? 'bg-[#79A997]/15 text-[#79A997]'
                              : 'bg-[#252D36] text-[#929DA9]'
                          }`}
                        >
                          {isEngine ? veh.tractionType : veh.subCategory || 'Wagon'}
                        </span>
                        {veh.isVariant && (
                          <span className="px-1 py-0.5 rounded text-[9px] bg-[#D6A85B]/15 text-[#D6A85B]">
                            {veh.variantKind}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#929DA9]">
                      {veh.lengthMeters.toFixed(1)}×{(veh.dimensions?.width || 3.1).toFixed(1)}×
                      {(veh.dimensions?.height || 4.1).toFixed(1)}m
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[#929DA9]">
                      {veh.massTons} t
                    </td>
                    <td className="py-2.5 px-4 text-[#929DA9]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[110px]">
                          {veh.wagonShape || '-'}
                        </span>
                        {diag && (
                          <span
                            className={`text-[10px] px-1 rounded ${
                              diag.shapeLoaded
                                ? 'bg-[#69BD91]/15 text-[#69BD91]'
                                : 'bg-[#D6A85B]/15 text-[#D6A85B]'
                            }`}
                          >
                            {texTotal > 0 ? `${texAssigned}/${texTotal} tex` : diag.renderMode}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {onInspectVehicleIn3D && (
                          <button
                            onClick={() => onInspectVehicleIn3D(veh)}
                            title="Preview Single Vehicle in 3D Viewport"
                            className="px-2 py-1 bg-[#0E1115] hover:bg-[#1A2028] text-[#79A997] rounded border border-[#252D36] text-xs font-semibold transition-colors flex items-center gap-1"
                          >
                            <Box className="w-3 h-3" />
                            <span>3D View</span>
                          </button>
                        )}
                        <button
                          onClick={() => onAddVehicleToConsist(veh)}
                          title="Append to Active Consist"
                          className="px-2 py-1 bg-[#1A2028] hover:bg-[#79A997] text-[#929DA9] hover:text-[#090B0D] rounded border border-[#252D36] text-xs font-semibold transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
