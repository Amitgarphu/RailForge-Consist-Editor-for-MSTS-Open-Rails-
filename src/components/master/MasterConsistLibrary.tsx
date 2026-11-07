/**
 * RailForge Consist - Master Consist Library & Blueprint Editor
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { MasterConsist, VehicleItem, ConsistFile } from '../../types/msts';
import { resolveMasterConsistSlots, buildConsistFromMaster } from '../../engine/masterConsistManager';
import { 
  BookOpen, 
  Plus, 
  Copy, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  AlertTriangle, 
  Play, 
  Search,
  Layers,
  Sparkles
} from 'lucide-react';

interface MasterConsistLibraryProps {
  masterConsists: MasterConsist[];
  catalogue: Map<string, VehicleItem>;
  onSelectMasterForBuilder: (consist: ConsistFile) => void;
  onUpdateMasterConsists: (updated: MasterConsist[]) => void;
}

export const MasterConsistLibrary: React.FC<MasterConsistLibraryProps> = ({
  masterConsists,
  catalogue,
  onSelectMasterForBuilder,
  onUpdateMasterConsists
}) => {
  const [selectedId, setSelectedId] = useState<string>(masterConsists[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredMasters = masterConsists.filter(m => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = m.name.toLowerCase().includes(q);
      const matchDesc = m.description.toLowerCase().includes(q);
      const matchKeywords = m.keywords.some(k => k.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchKeywords) return false;
    }
    if (activeCategory !== 'all') {
      if (activeCategory === 'lhb' && m.coachFamily !== 'LHB') return false;
      if (activeCategory === 'icf' && m.coachFamily !== 'ICF') return false;
      if (activeCategory === 'freight' && m.coachFamily !== 'Freight') return false;
    }
    return true;
  });

  const selectedMaster = masterConsists.find(m => m.id === selectedId) || masterConsists[0];
  const slotResolution = selectedMaster
    ? resolveMasterConsistSlots(selectedMaster, catalogue)
    : null;

  // Duplicate a template
  const handleDuplicate = (master: MasterConsist) => {
    const copy: MasterConsist = {
      ...master,
      id: `master_${Date.now()}`,
      name: `${master.name} (Copy)`,
      isStarterTemplate: false,
      updatedAt: Date.now()
    };
    const updated = [...masterConsists, copy];
    onUpdateMasterConsists(updated);
    setSelectedId(copy.id);
  };

  // Delete a template (if not starter)
  const handleDelete = (id: string) => {
    const updated = masterConsists.filter(m => m.id !== id);
    onUpdateMasterConsists(updated);
    if (selectedId === id && updated.length > 0) {
      setSelectedId(updated[0].id);
    }
  };

  // Load into main Consist Builder
  const handleLoadIntoBuilder = (master: MasterConsist) => {
    const consist = buildConsistFromMaster(master, catalogue);
    onSelectMasterForBuilder(consist);
  };

  return (
    <div className="flex h-full bg-[#0E1115] overflow-hidden select-none">
      {/* Left Column: Template List */}
      <div className="w-[360px] bg-[#14191F] border-r border-[#252D36] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#252D36] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-[#E8EDF2]">
              Master Consist Templates
            </span>
            <span className="text-[11px] font-mono text-[#65717E] tabular-nums">
              {filteredMasters.length} Templates
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#65717E]" />
            <input
              type="text"
              placeholder="Search templates, tags, traction..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#0E1115] border border-[#252D36] focus:border-[#79A997] rounded text-xs text-[#E8EDF2] placeholder-[#65717E] focus:outline-none"
            />
          </div>

          <div className="flex gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'lhb', label: 'LHB' },
              { id: 'icf', label: 'ICF' },
              { id: 'freight', label: 'Freight' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                  activeCategory === tab.id
                    ? 'bg-[#1A2028] text-[#79A997] border border-[#252D36]'
                    : 'text-[#929DA9] hover:text-[#E8EDF2]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#252D36]/40">
          {filteredMasters.map(m => {
            const isSelected = selectedId === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#1A2028] border-l-2 border-l-[#79A997]'
                    : 'hover:bg-[#1A2028]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#E8EDF2] truncate max-w-[210px]">
                    {m.name}
                  </span>
                  <span className="text-[10px] font-mono text-[#79A997] bg-[#79A997]/15 px-1.5 py-0.5 rounded">
                    {m.coachFamily}
                  </span>
                </div>

                <div className="text-[11px] text-[#65717E] line-clamp-2 mt-1">
                  {m.description}
                </div>

                <div className="flex items-center gap-2 mt-2 text-[10px] text-[#929DA9] font-mono">
                  <span>{m.vehicleCount} Units</span>
                  <span>·</span>
                  <span>{m.serviceType}</span>
                  {m.preferredLocoFamily && (
                    <>
                      <span>·</span>
                      <span className="text-[#D6A85B]">{m.preferredLocoFamily}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Template Inspector & Formation Slot Resolver */}
      {selectedMaster && slotResolution && (
        <div className="flex-1 flex flex-col bg-[#0E1115] overflow-y-auto p-6 space-y-6">
          {/* Header Card */}
          <div className="bg-[#14191F] border border-[#252D36] p-5 rounded-lg flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#79A997]">
                  {selectedMaster.stockCategory} Blueprint
                </span>
                <span className="text-[#65717E]">·</span>
                <span className="text-xs font-mono text-[#929DA9]">
                  {slotResolution.resolvedPercentage}% Bound to Installed Stock
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#E8EDF2]">{selectedMaster.name}</h2>
              <p className="text-xs text-[#929DA9] max-w-2xl">{selectedMaster.description}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {selectedMaster.keywords.map((k, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono px-2 py-0.5 bg-[#1A2028] text-[#929DA9] rounded border border-[#252D36]"
                  >
                    #{k}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleDuplicate(selectedMaster)}
                title="Duplicate Template"
                className="p-2 bg-[#1A2028] hover:bg-[#252D36] text-[#929DA9] hover:text-[#E8EDF2] border border-[#252D36] rounded text-xs transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>

              {!selectedMaster.isStarterTemplate && (
                <button
                  onClick={() => handleDelete(selectedMaster.id)}
                  title="Delete Template"
                  className="p-2 bg-[#1A2028] hover:bg-[#D87575]/20 text-[#D87575] border border-[#252D36] rounded text-xs transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => handleLoadIntoBuilder(selectedMaster)}
                className="flex items-center gap-2 px-4 py-2 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors shadow"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Open in 3D Consist Builder</span>
              </button>
            </div>
          </div>

          {/* Slots & Real Installed Vehicle Resolution Table */}
          <div className="bg-[#14191F] border border-[#252D36] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[#252D36] pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#E8EDF2]">
                Formation Blueprint Slots & Stock Binding
              </span>
              <span className="text-xs font-mono text-[#65717E]">
                {slotResolution.slotsWithStock.length} Formation Slots
              </span>
            </div>

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {slotResolution.slotsWithStock.map((item, idx) => (
                <div
                  key={item.slot.id}
                  className="p-2.5 rounded bg-[#0E1115] border border-[#252D36] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-[#65717E] bg-[#14191F] px-1.5 py-0.5 rounded border border-[#252D36]">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-[#E8EDF2]">{item.slot.label}</div>
                      <div className="text-[11px] font-mono text-[#65717E]">
                        Target: {item.slot.preferredSubCategory || item.slot.category}
                      </div>
                    </div>
                  </div>

                  {/* Bound Installed Vehicle or Recommendation */}
                  <div className="text-right">
                    {item.vehicle ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[#79A997]">
                          {item.vehicle.folder}/{item.vehicle.filename}
                        </span>
                        <span className="text-[#69BD91] text-[10px] font-mono bg-[#69BD91]/15 px-1.5 py-0.5 rounded">
                          Bound
                        </span>
                      </div>
                    ) : item.recommendedReplacements.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-[#D6A85B]">
                          Suggest: {item.recommendedReplacements[0].filename}
                        </span>
                        <span className="text-[#D6A85B] text-[10px] font-mono bg-[#D6A85B]/15 px-1.5 py-0.5 rounded">
                          Available
                        </span>
                      </div>
                    ) : (
                      <span className="text-[#65717E] text-[11px] font-mono">
                        Slot unassigned (schematic fallback)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
