/**
 * RailForge Consist - Saved Consist Library View
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { ConsistFile } from '../../types/msts';
import { serializeConsist } from '../../engine/conSerializer';
import { 
  FolderArchive, 
  Search, 
  Play, 
  Download, 
  Trash2, 
  Copy, 
  Layers, 
  Calendar,
  FileCheck
} from 'lucide-react';

interface ConsistLibraryViewProps {
  savedConsists: ConsistFile[];
  onOpenInBuilder: (consist: ConsistFile) => void;
  onDeleteConsist: (id: string) => void;
}

export const ConsistLibraryView: React.FC<ConsistLibraryViewProps> = ({
  savedConsists,
  onOpenInBuilder,
  onDeleteConsist
}) => {
  const [search, setSearch] = useState('');

  const filteredConsists = savedConsists.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.filename.toLowerCase().includes(q) ||
      c.vehicles.some(v => v.filename.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
    );
  });

  const handleDownload = (consist: ConsistFile) => {
    const serialized = serializeConsist(consist);
    const blob = new Blob([serialized], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = consist.filename.endsWith('.con') ? consist.filename : `${consist.filename}.con`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#0E1115] overflow-hidden select-none">
      {/* Header */}
      <div className="p-6 bg-[#14191F] border-b border-[#252D36] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#E8EDF2] tracking-wide">
              SAVED CONSIST REPOSITORY
            </h2>
            <p className="text-xs text-[#929DA9] mt-0.5">
              Archive of assembled train formations and successfully recovered .CON files.
            </p>
          </div>
          <span className="text-xs font-mono text-[#79A997] bg-[#79A997]/15 px-2.5 py-1 rounded">
            {savedConsists.length} Consists
          </span>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#65717E]" />
          <input
            type="text"
            placeholder="Search saved consists by name, file, or stock..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#0E1115] border border-[#252D36] focus:border-[#79A997] rounded text-xs text-[#E8EDF2] placeholder-[#65717E] focus:outline-none"
          />
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredConsists.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#65717E] space-y-2">
            <FileCheck className="w-8 h-8 mx-auto text-[#252D36]" />
            <div>No saved consists found.</div>
            <div>Assemble a train in the Consist Builder or recover broken files in the Workbench.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConsists.map(consist => {
              const totalLength = Math.round(consist.vehicles.reduce((sum, v) => sum + (v.lengthMeters || 22), 0));
              const totalMass = Math.round(consist.vehicles.reduce((sum, v) => sum + (v.massTons || 48), 0));
              const engineCount = consist.vehicles.filter(v => v.type === 'engine').length;

              return (
                <div
                  key={consist.id}
                  className="bg-[#14191F] border border-[#252D36] hover:border-[#79A997]/50 rounded-lg p-4 space-y-3 flex flex-col justify-between transition-colors group shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-[#79A997] uppercase tracking-wider">
                        {engineCount > 0 ? `${engineCount} Loco` : 'Unpowered Rake'}
                      </span>
                      <span className="text-[10px] font-mono text-[#65717E]">
                        v{consist.serial}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[#E8EDF2] truncate" title={consist.name}>
                      {consist.name}
                    </h3>
                    <div className="text-[11px] font-mono text-[#65717E] truncate">
                      {consist.filename}
                    </div>
                  </div>

                  {/* Consist Specs */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#252D36]/60 text-center font-mono text-xs">
                    <div>
                      <span className="text-[9px] text-[#65717E] block uppercase">Vehicles</span>
                      <span className="text-[#E8EDF2] font-semibold">{consist.vehicles.length}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#65717E] block uppercase">Length</span>
                      <span className="text-[#E8EDF2] font-semibold">{totalLength}m</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#65717E] block uppercase">Mass</span>
                      <span className="text-[#E8EDF2] font-semibold">{totalMass}t</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onOpenInBuilder(consist)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-semibold transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Edit in 3D</span>
                    </button>

                    <button
                      onClick={() => handleDownload(consist)}
                      title="Download .CON File"
                      className="p-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#E8EDF2] border border-[#252D36] rounded transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteConsist(consist.id)}
                      title="Delete Consist"
                      className="p-1.5 bg-[#1A2028] hover:bg-[#D87575]/20 text-[#D87575] border border-[#252D36] rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
