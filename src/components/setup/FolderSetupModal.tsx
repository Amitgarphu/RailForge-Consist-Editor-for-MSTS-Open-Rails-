/**
 * RailForge Consist - MSTS/OpenRails Dual Directory Setup Wizard (TRAINSET & CONSISTS)
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import {
  FolderSearch,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  HardDrive,
  FolderKanban
} from 'lucide-react';
import {
  scanDirectoryHandle,
  scanConsistsDirectoryHandle,
  scanFileList,
  scanConsistsFileList,
  saveStoredDirectoryHandle,
  saveStoredConsistsHandle,
  resolveMstsDirectoriesFromHandle,
  ScanProgress,
  FullTrainsetScanResult
} from '../../engine/trainsetScanner';
import { VehicleItem, ConsistFile } from '../../types/msts';

interface FolderSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (
    vehicles: VehicleItem[],
    trainsetPathName: string,
    fullResult?: FullTrainsetScanResult,
    consistsPathName?: string
  ) => void;
  onConsistsScanComplete?: (consists: ConsistFile[], consistsPathName: string) => void;
  currentPath?: string;
  currentConsistsPath?: string;
  installedVehicles?: VehicleItem[];
}

export const FolderSetupModal: React.FC<FolderSetupModalProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  onConsistsScanComplete,
  currentPath,
  currentConsistsPath,
  installedVehicles = []
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. Select TRAINSET or Parent TRAINS Directory (Auto-detects both if TRAINS is selected)
  const handleSelectTrainsetOrTrains = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setProgress({
      filesExamined: 0,
      vehiclesFound: 0,
      currentFolder: 'Probing MSTS directory structure...'
    });

    try {
      if ('showDirectoryPicker' in window) {
        // @ts-expect-error - showDirectoryPicker is standard in Chromium
        const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
          mode: 'read',
          id: 'msts_trainset'
        });

        const resolved = await resolveMstsDirectoriesFromHandle(dirHandle);
        if (resolved.trainsetHandle) {
          await saveStoredDirectoryHandle(resolved.trainsetHandle);
        }
        if (resolved.consistsHandle) {
          await saveStoredConsistsHandle(resolved.consistsHandle);
        }

        const result = await scanDirectoryHandle(
          dirHandle,
          (p) => setProgress(p),
          resolved.consistsHandle
        );

        setIsScanning(false);
        const tName = resolved.trainsetHandle?.name || dirHandle.name;
        const cName = resolved.consistsHandle?.name;
        onScanComplete(result.vehicles, tName, result, cName);
        if (result.consists.length > 0 && onConsistsScanComplete && cName) {
          onConsistsScanComplete(result.consists, cName);
        }
        onClose();
      } else {
        throw new Error(
          'FileSystemDirectoryHandle API not available in this browser context. Use the folder file input below.'
        );
      }
    } catch (err: any) {
      setIsScanning(false);
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Failed to access TRAINSET directory.');
      }
    }
  };

  // 2. Select CONSISTS Directory Independently
  const handleSelectConsistsDirectory = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setProgress({
      filesExamined: 0,
      vehiclesFound: 0,
      currentFolder: 'Scanning CONSISTS (.CON files)...'
    });

    try {
      if ('showDirectoryPicker' in window) {
        // @ts-expect-error - showDirectoryPicker is standard in Chromium
        const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
          mode: 'read',
          id: 'msts_consists'
        });

        await saveStoredConsistsHandle(dirHandle);
        const consists = await scanConsistsDirectoryHandle(dirHandle, installedVehicles);

        setIsScanning(false);
        if (onConsistsScanComplete) {
          onConsistsScanComplete(consists, dirHandle.name);
        }
        onClose();
      } else {
        throw new Error(
          'FileSystemDirectoryHandle API not available. Use the fallback CONSISTS picker below.'
        );
      }
    } catch (err: any) {
      setIsScanning(false);
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Failed to access CONSISTS directory.');
      }
    }
  };

  // Fallback via HTML5 directory input (handles TRAINSET, TRAINS, or CONSISTS)
  const handleHtml5FolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMsg(null);
    setProgress({ filesExamined: 0, vehiclesFound: 0, currentFolder: 'Indexing files...' });

    try {
      const fileArray = Array.from(files);
      const rootFolder = fileArray[0].webkitRelativePath?.split('/')[0] || 'TRAINSET';

      const result = await scanFileList(fileArray, (p) => {
        setProgress(p);
      });

      setIsScanning(false);
      onScanComplete(
        result.vehicles,
        rootFolder,
        result,
        result.consists.length > 0 ? 'CONSISTS' : undefined
      );
      if (result.consists.length > 0 && onConsistsScanComplete) {
        onConsistsScanComplete(result.consists, 'CONSISTS');
      }
      onClose();
    } catch (err: any) {
      setIsScanning(false);
      setErrorMsg(err.message || 'Error parsing files from folder.');
    }
  };

  // Fallback specifically for CONSISTS (.CON files)
  const handleHtml5ConsistsSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMsg(null);
    try {
      const fileArray = Array.from(files);
      const folderName = fileArray[0].webkitRelativePath?.split('/')[0] || 'CONSISTS';
      const consists = await scanConsistsFileList(fileArray, installedVehicles);
      setIsScanning(false);
      if (onConsistsScanComplete) {
        onConsistsScanComplete(consists, folderName);
      }
      onClose();
    } catch (err: any) {
      setIsScanning(false);
      setErrorMsg(err.message || 'Error parsing .CON files.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-2xl bg-[#14191F] border border-[#252D36] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#252D36] bg-[#0E1115]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#1A2028] text-[#79A997] rounded border border-[#252D36]">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E8EDF2] tracking-wide">
                MSTS / OPEN RAILS DIRECTORY CONFIGURATION
              </h3>
              <p className="text-[11px] text-[#65717E]">
                Configure independent TRAINSET (.ENG/.WAG) and CONSISTS (.CON) directories or
                auto-detect from TRAINS
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isScanning}
            className="p-1 text-[#65717E] hover:text-[#E8EDF2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[82vh]">
          <div className="p-3 bg-[#0E1115] border border-[#252D36] rounded text-xs text-[#929DA9] leading-relaxed">
            You can either select your parent{' '}
            <code className="text-[#79A997] font-mono">TRAINS</code> directory (which automatically
            detects both <code className="text-[#E8EDF2] font-mono">TRAINSET</code> and{' '}
            <code className="text-[#E8EDF2] font-mono">CONSISTS</code>), or pick each directory
            independently below.
          </div>

          {/* Two Independent Directory Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. TRAINSET Directory Picker */}
            <div className="p-4 bg-[#0E1115] border border-[#252D36] rounded-lg flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#79A997] uppercase tracking-wider flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>1. TRAINSET Directory</span>
                  </span>
                  {currentPath && (
                    <CheckCircle2 className="w-4 h-4 text-[#69BD91]" />
                  )}
                </div>
                <p className="text-[11px] text-[#929DA9]">
                  Contains vehicle folders with <code className="font-mono">.ENG</code>,{' '}
                  <code className="font-mono">.WAG</code>, <code className="font-mono">.S</code>,{' '}
                  <code className="font-mono">.DDS</code>, <code className="font-mono">.ACE</code>,
                  and <code className="font-mono">OpenRails/</code> overrides.
                </p>
                <div className="p-2 bg-[#14191F] border border-[#252D36] rounded font-mono text-[11px] text-[#E8EDF2] truncate">
                  {currentPath || 'Not configured'}
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  onClick={handleSelectTrainsetOrTrains}
                  disabled={isScanning}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-[#79A997] hover:bg-[#547D70] disabled:opacity-50 text-[#090B0D] rounded text-xs font-bold tracking-wide transition-colors shadow"
                >
                  <FolderSearch className="w-4 h-4" />
                  <span>SELECT TRAINSET (OR TRAINS)</span>
                </button>

                <label className="w-full text-[11px] text-[#65717E] hover:text-[#79A997] cursor-pointer flex items-center justify-center gap-1.5 py-1 transition-colors">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Browser folder upload fallback</span>
                  <input
                    type="file"
                    // @ts-expect-error - webkitdirectory is standard for folder inputs
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleHtml5FolderSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 2. CONSISTS Directory Picker */}
            <div className="p-4 bg-[#0E1115] border border-[#252D36] rounded-lg flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#E8EDF2] uppercase tracking-wider flex items-center gap-1.5">
                    <FolderKanban className="w-3.5 h-3.5 text-[#79A997]" />
                    <span>2. CONSISTS Directory</span>
                  </span>
                  {currentConsistsPath && (
                    <CheckCircle2 className="w-4 h-4 text-[#69BD91]" />
                  )}
                </div>
                <p className="text-[11px] text-[#929DA9]">
                  Contains MSTS / Open Rails <code className="font-mono">.CON</code> train formation
                  files (kept strictly separate from rolling-stock count).
                </p>
                <div className="p-2 bg-[#14191F] border border-[#252D36] rounded font-mono text-[11px] text-[#E8EDF2] truncate">
                  {currentConsistsPath || 'Not configured'}
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  onClick={handleSelectConsistsDirectory}
                  disabled={isScanning}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-[#1A2028] hover:bg-[#252D36] disabled:opacity-50 text-[#79A997] border border-[#252D36] rounded text-xs font-bold tracking-wide transition-colors"
                >
                  <FolderKanban className="w-4 h-4" />
                  <span>SELECT CONSISTS FOLDER</span>
                </button>

                <label className="w-full text-[11px] text-[#65717E] hover:text-[#79A997] cursor-pointer flex items-center justify-center gap-1.5 py-1 transition-colors">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Browser .CON folder fallback</span>
                  <input
                    type="file"
                    // @ts-expect-error - webkitdirectory is standard for folder inputs
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleHtml5ConsistsSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Real-time Scanning Progress Indicator */}
          {isScanning && progress && (
            <div className="p-3.5 bg-[#0E1115] border border-[#252D36] rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#929DA9] flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#79A997]" />
                  <span>Scanning: {progress.currentFolder}</span>
                </span>
                <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                  {progress.vehiclesFound} Definitions
                </span>
              </div>

              <div className="w-full bg-[#1A2028] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#79A997] h-full transition-all duration-200 animate-pulse"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="text-[11px] font-mono text-[#65717E] text-right tabular-nums">
                {progress.filesExamined} files inspected (.ENG, .WAG, .S, .SD, .DDS, .ACE, .CON)
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-[#D87575]/10 border border-[#D87575]/30 rounded text-xs text-[#D87575]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
