/**
 * RailForge Consist - Visual Formation Timeline (Horizontal Strip)
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { ConsistFile, VehicleItem } from '../../types/msts';
import {
  ArrowLeftRight,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface FormationTimelineProps {
  consist: ConsistFile;
  selectedVehicleIndex: number | null;
  selectedLibraryVehicle?: VehicleItem | null;
  onSelectVehicle: (index: number | null) => void;
  onMoveVehicle: (fromIndex: number, toIndex: number) => void;
  onDuplicateVehicle: (index: number) => void;
  onRemoveVehicle: (index: number) => void;
  onFlipVehicle: (index: number) => void;
  onReplaceSelectedUnit?: () => void;
  onOpenLibraryAdd: () => void;
}

export const FormationTimeline: React.FC<FormationTimelineProps> = ({
  consist,
  selectedVehicleIndex,
  selectedLibraryVehicle = null,
  onSelectVehicle,
  onMoveVehicle,
  onDuplicateVehicle,
  onRemoveVehicle,
  onFlipVehicle,
  onReplaceSelectedUnit,
  onOpenLibraryAdd
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const totalLength = Math.round(
    consist.vehicles.reduce((sum, v) => sum + (v.lengthMeters || 22), 0)
  );
  const totalWeight = Math.round(
    consist.vehicles.reduce((sum, v) => sum + (v.massTons || 48), 0)
  );
  const maxKmh = Math.round(consist.maxVelocityMps * 3.6);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onMoveVehicle(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  };

  const activeUnit =
    selectedVehicleIndex !== null ? consist.vehicles[selectedVehicleIndex] : null;

  return (
    <div className="flex flex-col border-t border-[#252D36] bg-[#14191F] shrink-0">
      {/* Formation Header Bar & Telemetry */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#252D36] bg-[#0E1115] gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wider uppercase text-[#E8EDF2]">
            Consist Formation ({consist.filename})
          </span>
          <span className="text-[#65717E]">·</span>
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#929DA9]">
            <span>{consist.vehicles.length} Units</span>
            <span>{totalLength} m</span>
            <span>{totalWeight} t</span>
            <span>{maxKmh} km/h</span>
          </div>
        </div>

        {/* Action Controls (TSRE5-style unit operations + Replace Selected Unit) */}
        <div className="flex items-center gap-2">
          {selectedVehicleIndex !== null &&
            activeUnit &&
            selectedLibraryVehicle &&
            onReplaceSelectedUnit && (
              <button
                onClick={onReplaceSelectedUnit}
                title={`Substitute Unit #${selectedVehicleIndex + 1} (${activeUnit.name}) with ${selectedLibraryVehicle.name}`}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#79A997]/15 hover:bg-[#79A997] text-[#79A997] hover:text-[#090B0D] border border-[#79A997]/50 rounded text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="truncate max-w-[200px]">
                  Replace Unit #{selectedVehicleIndex + 1} with {selectedLibraryVehicle.filename}
                </span>
              </button>
            )}

          {selectedVehicleIndex !== null && activeUnit && (
            <div className="flex items-center gap-1 bg-[#1A2028] p-0.5 rounded border border-[#252D36] text-xs">
              <button
                onClick={() =>
                  onMoveVehicle(selectedVehicleIndex, Math.max(0, selectedVehicleIndex - 1))
                }
                disabled={selectedVehicleIndex === 0}
                title="Move Unit Forward / Left"
                className="p-1 text-[#929DA9] hover:text-[#E8EDF2] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  onMoveVehicle(
                    selectedVehicleIndex,
                    Math.min(consist.vehicles.length - 1, selectedVehicleIndex + 1)
                  )
                }
                disabled={selectedVehicleIndex === consist.vehicles.length - 1}
                title="Move Unit Back / Right"
                className="p-1 text-[#929DA9] hover:text-[#E8EDF2] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <div className="w-[1px] h-3 bg-[#252D36] mx-0.5" />
              <button
                onClick={() => onFlipVehicle(selectedVehicleIndex)}
                title="Reverse Direction (Flip)"
                className="p-1 text-[#929DA9] hover:text-[#79A997]"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDuplicateVehicle(selectedVehicleIndex)}
                title="Duplicate Unit"
                className="p-1 text-[#929DA9] hover:text-[#79A997]"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onRemoveVehicle(selectedVehicleIndex)}
                title="Remove Unit from Consist"
                className="p-1 text-[#D87575] hover:bg-[#D87575]/20 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={onOpenLibraryAdd}
            disabled={!selectedLibraryVehicle}
            title={
              selectedLibraryVehicle
                ? `Append ${selectedLibraryVehicle.name} to Consist`
                : 'Select a vehicle in the left Rolling Stock Inventory to append'
            }
            className="flex items-center gap-1.5 px-3 py-1 bg-[#1A2028] hover:bg-[#252D36] disabled:opacity-40 text-[#79A997] hover:text-white border border-[#252D36] rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Append Selected</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Cards Strip */}
      <div className="flex items-center gap-2 p-3 overflow-x-auto min-h-[118px] max-h-[135px]">
        {consist.vehicles.length === 0 ? (
          <div className="flex items-center justify-center w-full py-6 text-xs text-[#65717E]">
            Consist is empty. Select a locomotive or coach from the Rolling Stock Inventory on the
            left.
          </div>
        ) : (
          consist.vehicles.map((veh, index) => {
            const isSelected = selectedVehicleIndex === index;
            const isEngine = veh.type === 'engine';

            return (
              <div
                key={`${veh.uid}_${index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => onSelectVehicle(index)}
                className={`relative flex flex-col justify-between w-48 h-[92px] p-2 rounded cursor-pointer transition-all border shrink-0 select-none ${
                  isSelected
                    ? 'bg-[#1A2028] border-[#79A997] shadow-lg'
                    : 'bg-[#0E1115] hover:bg-[#14191F] border-[#252D36]'
                }`}
              >
                {/* Top Row: Index Badge & Vehicle Type */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-[#65717E] bg-[#14191F] px-1 py-0.5 rounded border border-[#252D36]">
                      #{index + 1}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider truncate max-w-[95px] ${
                        isEngine ? 'text-[#79A997]' : 'text-[#929DA9]'
                      }`}
                    >
                      {isEngine ? 'Locomotive' : veh.subCategory || veh.category}
                    </span>
                  </div>

                  {/* Missing Alert or Direction Indicator */}
                  <div className="flex items-center gap-1">
                    {veh.isMissingInTrainset && (
                      <span title="Vehicle not found in Trainset" className="text-[#D6A85B]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {veh.flipDirection && (
                      <span
                        title="Flipped (Reverse orientation)"
                        className="text-[#79A997] text-[10px] font-mono"
                      >
                        ⇄ FLIP
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle: Vehicle Name & Raw File */}
                <div className="my-1">
                  <div
                    className="text-xs font-semibold text-[#E8EDF2] truncate"
                    title={veh.name}
                  >
                    {veh.name || veh.filename}
                  </div>
                  <div className="text-[11px] text-[#65717E] truncate font-mono">
                    {veh.filename}.{isEngine ? 'eng' : 'wag'}
                  </div>
                </div>

                {/* Bottom Row: Folder & Length */}
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#65717E] border-t border-[#252D36]/60 pt-1">
                  <span className="truncate max-w-[110px]" title={veh.folder}>
                    {veh.folder}
                  </span>
                  <span>{veh.lengthMeters ? `${veh.lengthMeters.toFixed(1)}m` : '22.0m'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
