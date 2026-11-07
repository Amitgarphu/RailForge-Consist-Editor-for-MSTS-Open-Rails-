/**
 * RailForge Consist - Top Navigation Header
 * @license Apache-2.0
 */

import React from 'react';
import { HardDrive, RefreshCw, Settings, Info, FolderKanban } from 'lucide-react';

interface HeaderProps {
  trainsetPath?: string;
  consistsPath?: string;
  logicalVehicleCount?: number;
  rawVehicleCount?: number;
  consistCount?: number;
  onOpenFolderSetup: () => void;
  onRescanTrainset: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  activeViewTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  trainsetPath,
  consistsPath,
  logicalVehicleCount = 0,
  rawVehicleCount = 0,
  consistCount = 0,
  onOpenFolderSetup,
  onRescanTrainset,
  onOpenSettings,
  onOpenAbout,
  activeViewTitle
}) => {
  return (
    <header className="flex items-center justify-between px-5 py-2 bg-[#090B0D] border-b border-[#252D36] select-none h-12 shrink-0">
      {/* Zone 1: Breadcrumb & View Title */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tight text-[#E8EDF2] font-heading">
          RAILFORGE CONSIST
        </span>
        <span className="text-[#65717E]">/</span>
        <span className="text-xs font-semibold text-[#79A997] uppercase tracking-wider">
          {activeViewTitle}
        </span>
      </div>

      {/* Zone 2: Separate TRAINSET & CONSISTS Directory Status Pills */}
      <div className="flex items-center gap-2">
        <div
          onClick={onOpenFolderSetup}
          className="flex items-center gap-2 px-2.5 py-1 bg-[#14191F] hover:bg-[#1A2028] border border-[#252D36] rounded text-xs cursor-pointer transition-colors"
          title="Click to configure TRAINSET and CONSISTS directories"
        >
          <HardDrive className="w-3.5 h-3.5 text-[#79A997]" />
          <span className="text-[#65717E]">TRAINSET:</span>
          <span className="font-mono text-[#E8EDF2] font-medium max-w-[160px] truncate">
            {trainsetPath || 'Not Configured'}
          </span>
          {rawVehicleCount > 0 && (
            <span
              className="px-1.5 py-0.2 bg-[#1A2028] text-[#79A997] font-mono text-[10px] rounded border border-[#252D36]"
              title={`${logicalVehicleCount} logical vehicles (${rawVehicleCount} total raw .ENG/.WAG definitions)`}
            >
              {logicalVehicleCount} stock
            </span>
          )}
        </div>

        <div
          onClick={onOpenFolderSetup}
          className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-[#14191F] hover:bg-[#1A2028] border border-[#252D36] rounded text-xs cursor-pointer transition-colors"
          title="Click to configure CONSISTS directory"
        >
          <FolderKanban className="w-3.5 h-3.5 text-[#929DA9]" />
          <span className="text-[#65717E]">CONSISTS:</span>
          <span className="font-mono text-[#E8EDF2] font-medium max-w-[140px] truncate">
            {consistsPath || 'Not Configured'}
          </span>
          {consistCount > 0 && (
            <span className="px-1.5 py-0.2 bg-[#1A2028] text-[#929DA9] font-mono text-[10px] rounded border border-[#252D36]">
              {consistCount} .con
            </span>
          )}
        </div>

        {(trainsetPath || consistsPath) && (
          <button
            onClick={onRescanTrainset}
            title="Rescan TRAINSET & CONSISTS Directories"
            className="p-1.5 bg-[#14191F] hover:bg-[#1A2028] text-[#929DA9] hover:text-[#79A997] border border-[#252D36] rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Zone 3: Visible Settings Gear Button & About */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          title="Open Application & Directory Settings"
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#14191F] hover:bg-[#1A2028] text-[#E8EDF2] hover:text-[#79A997] border border-[#252D36] rounded text-xs font-medium transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-[#79A997]" />
          <span>Settings</span>
        </button>

        <button
          onClick={onOpenAbout}
          title="About RailForge Consist"
          className="p-1.5 text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#14191F] border border-transparent hover:border-[#252D36] rounded transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
