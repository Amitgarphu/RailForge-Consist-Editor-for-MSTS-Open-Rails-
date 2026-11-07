/**
 * RailForge Consist - Application Settings, Dual Directory Manager & Regression Verification Suite
 * @license Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  FolderKanban,
  ShieldCheck,
  Play
} from 'lucide-react';
import {
  clearStoredDirectoryHandle,
  clearStoredConsistsHandle
} from '../../engine/trainsetScanner';
import { TrainsetScanStats } from '../../types/msts';
import {
  runRegressionVerificationSuite,
  RegressionSuiteReport
} from '../../engine/regressionBaseline';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainsetPath?: string;
  consistsPath?: string;
  scanStats?: TrainsetScanStats | null;
  onOpenFolderSetup: () => void;
  onRescanTrainset: () => void;
  onClearTrainset: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  trainsetPath,
  consistsPath,
  scanStats,
  onOpenFolderSetup,
  onRescanTrainset,
  onClearTrainset
}) => {
  const [regressionReport, setRegressionReport] = useState<RegressionSuiteReport | null>(null);

  useEffect(() => {
    if (isOpen && !regressionReport) {
      setRegressionReport(runRegressionVerificationSuite());
    }
  }, [isOpen, regressionReport]);

  if (!isOpen) return null;

  const handleClear = async () => {
    await clearStoredDirectoryHandle();
    await clearStoredConsistsHandle();
    onClearTrainset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-2xl bg-[#14191F] border border-[#252D36] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#252D36] bg-[#0E1115] shrink-0">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#79A997]" />
            <h3 className="text-sm font-bold text-[#E8EDF2] tracking-wider uppercase">
              Application & Directory Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#65717E] hover:text-[#E8EDF2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Section 1: Dual Directory Management (TRAINSET & CONSISTS) */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-bold text-[#79A997] uppercase tracking-wider block">
              1. MSTS / Open Rails Directory Paths
            </span>

            <div className="p-3.5 bg-[#0E1115] border border-[#252D36] rounded-lg space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-[#14191F] border border-[#252D36] rounded space-y-1">
                  <div className="flex items-center gap-1.5 text-[#79A997] font-semibold">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>TRAINSET Directory (.ENG / .WAG)</span>
                  </div>
                  <div className="font-mono text-[#E8EDF2] truncate">
                    {trainsetPath || 'Not configured'}
                  </div>
                </div>

                <div className="p-2.5 bg-[#14191F] border border-[#252D36] rounded space-y-1">
                  <div className="flex items-center gap-1.5 text-[#929DA9] font-semibold">
                    <FolderKanban className="w-3.5 h-3.5 text-[#79A997]" />
                    <span>CONSISTS Directory (.CON)</span>
                  </div>
                  <div className="font-mono text-[#E8EDF2] truncate">
                    {consistsPath || 'Not configured'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#252D36]/60">
                <button
                  onClick={() => {
                    onClose();
                    onOpenFolderSetup();
                  }}
                  className="flex-1 px-3 py-1.5 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors"
                >
                  Configure / Change Directories
                </button>
                {(trainsetPath || consistsPath) && (
                  <>
                    <button
                      onClick={onRescanTrainset}
                      className="px-3 py-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Rescan All</span>
                    </button>
                    <button
                      onClick={handleClear}
                      className="px-3 py-1.5 bg-[#1A2028] hover:bg-[#D87575]/20 text-[#D87575] border border-[#252D36] rounded text-xs font-medium transition-colors"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Six-Tier Inventory Accounting & Asset Scan Summary */}
          {scanStats && (
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-[#79A997] uppercase tracking-wider block">
                2. Six-Tier Inventory Accounting & Asset Scan Audit
              </span>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">Logical Stock</span>
                  <span className="font-mono text-sm font-bold text-[#79A997]">
                    {scanStats.logicalVehicleFamiliesCount}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">Raw (.ENG/.WAG)</span>
                  <span className="font-mono text-sm font-bold text-[#E8EDF2]">
                    {scanStats.rawSourceDefinitionsCount}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">OR Overrides</span>
                  <span className="font-mono text-sm font-bold text-[#69BD91]">
                    {scanStats.openRailsOverridesMergedCount}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">AI/Trail Variants</span>
                  <span className="font-mono text-sm font-bold text-[#D6A85B]">
                    {scanStats.variantDefinitionsCount}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">Hash Duplicates</span>
                  <span className="font-mono text-sm font-bold text-[#929DA9]">
                    {scanStats.duplicateFilesCount}
                  </span>
                </div>
                <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded">
                  <span className="text-[10px] text-[#65717E] block">.CON Consists</span>
                  <span className="font-mono text-sm font-bold text-[#E8EDF2]">
                    {scanStats.conFilesDiscovered}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[#0E1115] border border-[#252D36] rounded flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#929DA9]">
                <span>Engines (.ENG): {scanStats.engFilesDiscovered}</span>
                <span>·</span>
                <span>Wagons (.WAG): {scanStats.wagFilesDiscovered}</span>
                <span>·</span>
                <span>Files Examined: {scanStats.totalFilesExamined}</span>
                <span>·</span>
                <span>Invalid skipped: {scanStats.invalidCount}</span>
              </div>
            </div>
          )}

          {/* Section 3: Automated SIMISA / DDS / ACE / 3D Baseline Regression Verification */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#79A997] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>3. SIMISA, DDS/ACE & 3D Baseline Regression Suite</span>
              </span>

              <button
                onClick={() => setRegressionReport(runRegressionVerificationSuite())}
                className="flex items-center gap-1 px-2 py-1 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-[11px] font-semibold transition-colors"
              >
                <Play className="w-3 h-3" />
                <span>Re-Run Verification</span>
              </button>
            </div>

            {regressionReport && (
              <div className="p-3 bg-[#0E1115] border border-[#252D36] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-[#252D36]">
                  <span className="font-semibold text-[#E8EDF2]">
                    Verification Status:{' '}
                    <span
                      className={
                        regressionReport.allPassed ? 'text-[#69BD91]' : 'text-[#D6A85B]'
                      }
                    >
                      {regressionReport.passedCount} / {regressionReport.totalCount} Passed
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-[#929DA9]">
                    3D Baseline: {regressionReport.baselineConsistVertices.toLocaleString()} verts ·{' '}
                    {regressionReport.baselineConsistTriangles.toLocaleString()} tris
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
                  {regressionReport.results.map((r) => (
                    <div
                      key={r.id}
                      className="p-2 bg-[#14191F] border border-[#252D36] rounded flex items-start justify-between gap-2 text-[11px]"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {r.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#69BD91] shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-[#D87575] shrink-0" />
                          )}
                          <span className="font-semibold text-[#E8EDF2]">{r.name}</span>
                        </div>
                        <div className="font-mono text-[10px] text-[#929DA9] pl-5 break-all">
                          {r.details}
                        </div>
                      </div>
                      <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-[#0E1115] border border-[#252D36] text-[#65717E] shrink-0">
                        {r.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
