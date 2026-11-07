/**
 * RailForge Consist - Broken Consist Recovery Workbench
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { BrokenConsistAnalysis, ConsistFile, MasterConsist, VehicleItem } from '../../types/msts';
import { parseConContent } from '../../engine/conParser';
import { analyzeBrokenConsist } from '../../engine/fuzzyMatcher';
import { buildConsistFromMaster } from '../../engine/masterConsistManager';
import { serializeConsist } from '../../engine/conSerializer';
import { 
  UploadCloud, 
  AlertTriangle, 
  CheckCircle, 
  FileCheck, 
  Download, 
  ArrowRight, 
  RefreshCw, 
  ChevronRight,
  ShieldCheck,
  Check,
  FileCode,
  Zap
} from 'lucide-react';

interface RecoveryWorkbenchProps {
  masterConsists: MasterConsist[];
  catalogue: Map<string, VehicleItem>;
  onSaveConsistToLibrary: (consist: ConsistFile) => void;
}

export const RecoveryWorkbench: React.FC<RecoveryWorkbenchProps> = ({
  masterConsists,
  catalogue,
  onSaveConsistToLibrary
}) => {
  const [analyses, setAnalyses] = useState<BrokenConsistAnalysis[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedMasterOverride, setSelectedMasterOverride] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Handle file uploads (.CON files)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newAnalyses: BrokenConsistAnalysis[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.con')) {
        try {
          const text = await file.text();
          const parsed = parseConContent(text, file.name);
          const analysis = analyzeBrokenConsist(parsed, masterConsists, catalogue);
          newAnalyses.push(analysis);
        } catch (err) {
          console.error('Error parsing .CON file:', file.name, err);
        }
      }
    }

    setAnalyses(prev => [...prev, ...newAnalyses]);
    if (selectedIndex === null && newAnalyses.length > 0) {
      setSelectedIndex(0);
    }
  };

  const currentAnalysis = selectedIndex !== null ? analyses[selectedIndex] : null;

  // Selected replacement Master Consist (top recommendation or manual override)
  const activeMasterId = selectedMasterOverride || currentAnalysis?.recommendedMasterId;
  const activeMaster = masterConsists.find(m => m.id === activeMasterId) || masterConsists[0];

  // Apply Recovery for current consist
  const handleApplyRecovery = (analysisIndex: number) => {
    const analysis = analyses[analysisIndex];
    if (!analysis) return;

    const masterId = selectedMasterOverride || analysis.recommendedMasterId;
    const master = masterConsists.find(m => m.id === masterId);
    if (!master) return;

    // Build replacement consist from Master, preserving original name + "_Recovered"
    const recoveredName = `${analysis.name} (Recovered)`;
    const recoveredFilename = `${analysis.filename.replace(/\.con$/i, '')}_recovered.con`;
    const repaired = buildConsistFromMaster(master, catalogue, recoveredName);
    repaired.filename = recoveredFilename;

    // Trigger download of genuine .CON file
    const serialized = serializeConsist(repaired);
    const blob = new Blob([serialized], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = recoveredFilename;
    a.click();
    URL.revokeObjectURL(url);

    onSaveConsistToLibrary(repaired);

    // Update status in state
    setAnalyses(prev => {
      const updated = [...prev];
      updated[analysisIndex] = {
        ...updated[analysisIndex],
        recoveryStatus: 'applied',
        repairedConsist: repaired
      };
      return updated;
    });
  };

  // Batch Recover All
  const handleBatchRecoverAll = () => {
    setIsProcessingBatch(true);
    analyses.forEach((analysis, idx) => {
      if (analysis.recoveryStatus === 'pending') {
        const master = masterConsists.find(m => m.id === analysis.recommendedMasterId) || masterConsists[0];
        if (master) {
          const recoveredName = `${analysis.name} (Recovered)`;
          const recoveredFilename = `${analysis.filename.replace(/\.con$/i, '')}_recovered.con`;
          const repaired = buildConsistFromMaster(master, catalogue, recoveredName);
          repaired.filename = recoveredFilename;

          const serialized = serializeConsist(repaired);
          const blob = new Blob([serialized], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = recoveredFilename;
          a.click();
          URL.revokeObjectURL(url);

          onSaveConsistToLibrary(repaired);
        }
      }
    });

    setAnalyses(prev => prev.map(a => ({ ...a, recoveryStatus: 'applied' })));
    setIsProcessingBatch(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0E1115] overflow-hidden select-none">
      {/* Workbench Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#14191F] border-b border-[#252D36]">
        <div>
          <h2 className="text-sm font-bold text-[#E8EDF2] flex items-center gap-2">
            <span>BROKEN CONSIST RECOVERY WORKBENCH</span>
            <span className="text-[11px] font-normal text-[#65717E]">· Non-Destructive Substitution Engine</span>
          </h2>
          <p className="text-xs text-[#929DA9] mt-0.5">
            Diagnoses missing stock in legacy .CON files and restores formations using verified Master Consists.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-semibold cursor-pointer transition-colors">
            <UploadCloud className="w-4 h-4" />
            <span>Import .CON Files</span>
            <input
              type="file"
              multiple
              accept=".con"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
          </label>

          {analyses.length > 0 && (
            <button
              onClick={handleBatchRecoverAll}
              disabled={isProcessingBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-semibold transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Batch Recover All ({analyses.filter(a => a.recoveryStatus === 'pending').length})</span>
            </button>
          )}
        </div>
      </div>

      {analyses.length === 0 ? (
        /* Empty State / Ingestion Dropzone */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md p-8 bg-[#14191F] border border-[#252D36] rounded-lg shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#1A2028] border border-[#252D36] flex items-center justify-center mx-auto text-[#79A997]">
              <FileCode className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#E8EDF2]">
                Import Broken Consist Files
              </h3>
              <p className="text-xs text-[#65717E] mt-1">
                Drop your MSTS activity consists here. RailForge will analyze missing vehicle references, evaluate the intended rake, and recommend replacement formations.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-semibold cursor-pointer transition-colors">
              <UploadCloud className="w-4 h-4" />
              <span>Select .CON Files</span>
              <input
                type="file"
                multiple
                accept=".con"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : (
        /* Main Recovery Split View */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Table: Imported Consists Queue */}
          <div className="w-[380px] bg-[#14191F] border-r border-[#252D36] flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#252D36] flex items-center justify-between text-xs text-[#929DA9]">
              <span className="font-semibold uppercase tracking-wider">Queue</span>
              <span className="font-mono tabular-nums">{analyses.length} Consists</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#252D36]/40">
              {analyses.map((analysis, index) => {
                const isSelected = selectedIndex === index;
                const isRecovered = analysis.recoveryStatus === 'applied';

                return (
                  <div
                    key={analysis.id}
                    onClick={() => {
                      setSelectedIndex(index);
                      setSelectedMasterOverride(null);
                    }}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#1A2028] border-l-2 border-l-[#79A997]'
                        : 'hover:bg-[#1A2028]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#E8EDF2] truncate max-w-[220px]">
                        {analysis.name}
                      </span>
                      {isRecovered ? (
                        <span className="text-[10px] text-[#69BD91] font-mono flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Recovered
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            analysis.confidenceLevel === 'high'
                              ? 'bg-[#69BD91]/20 text-[#69BD91]'
                              : analysis.confidenceLevel === 'medium'
                              ? 'bg-[#D6A85B]/20 text-[#D6A85B]'
                              : 'bg-[#D87575]/20 text-[#D87575]'
                          }`}
                        >
                          {analysis.confidenceScore}% Match
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-[#65717E] truncate mt-0.5">
                      {analysis.filename}
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-[10px] text-[#929DA9] font-mono">
                      <span>{analysis.totalVehicles} units</span>
                      <span>·</span>
                      <span className={analysis.missingCount > 0 ? 'text-[#D87575]' : 'text-[#69BD91]'}>
                        {analysis.missingCount} missing
                      </span>
                      <span>·</span>
                      <span className="text-[#79A997]">{analysis.detectedCoachFamily}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Area: Side-by-Side Comparison Inspector */}
          {currentAnalysis && (
            <div className="flex-1 flex flex-col bg-[#0E1115] overflow-y-auto p-6 space-y-6">
              {/* Match Header & Decision Banner */}
              <div className="bg-[#14191F] border border-[#252D36] p-4 rounded-lg flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#79A997]">
                      Recommended Replacement
                    </span>
                    <span className="text-[#65717E]">·</span>
                    <span className="text-xs font-mono tabular-nums text-[#E8EDF2]">
                      {currentAnalysis.confidenceScore}% Confidence ({currentAnalysis.confidenceLevel.toUpperCase()})
                    </span>
                  </div>
                  <div className="text-base font-semibold text-[#E8EDF2] mt-0.5">
                    {activeMaster?.name}
                  </div>
                  <div className="text-xs text-[#929DA9] mt-1 flex items-center gap-2">
                    {currentAnalysis.matchReasons.map((r, i) => (
                      <span key={i} className="bg-[#1A2028] px-2 py-0.5 rounded border border-[#252D36]">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Master Consist Template Selector Override */}
                  <select
                    value={activeMasterId}
                    onChange={(e) => setSelectedMasterOverride(e.target.value)}
                    className="bg-[#0E1115] border border-[#252D36] text-xs text-[#E8EDF2] rounded p-2 focus:border-[#79A997] focus:outline-none"
                  >
                    {masterConsists.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => selectedIndex !== null && handleApplyRecovery(selectedIndex)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#79A997] hover:bg-[#547D70] text-[#090B0D] rounded text-xs font-bold transition-colors shadow"
                  >
                    <Download className="w-4 h-4" />
                    <span>Apply & Export .CON</span>
                  </button>
                </div>
              </div>

              {/* Side-by-Side Formation Comparison */}
              <div className="grid grid-cols-2 gap-6">
                {/* LEFT: Original Broken Formation */}
                <div className="bg-[#14191F] border border-[#252D36] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#252D36] pb-2">
                    <div>
                      <div className="text-xs font-bold text-[#D87575] uppercase tracking-wider">
                        Original Broken Consist
                      </div>
                      <div className="text-sm font-semibold text-[#E8EDF2]">
                        {currentAnalysis.name}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-[#D87575] bg-[#D87575]/10 px-2 py-1 rounded border border-[#D87575]/30">
                      {currentAnalysis.missingCount} Missing
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                    {currentAnalysis.parsedConsist.vehicles.map((v, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded border text-xs font-mono flex items-center justify-between ${
                          v.isMissingInTrainset
                            ? 'bg-[#D87575]/10 border-[#D87575]/40 text-[#D87575]'
                            : 'bg-[#0E1115] border-[#252D36] text-[#929DA9]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#65717E]">#{i + 1}</span>
                          <span className="font-semibold text-[#E8EDF2]">{v.filename}</span>
                        </div>
                        <span className="text-[10px] text-[#65717E]">{v.folder}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT: Proposed Master Consist Replacement */}
                <div className="bg-[#14191F] border border-[#252D36] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#252D36] pb-2">
                    <div>
                      <div className="text-xs font-bold text-[#69BD91] uppercase tracking-wider">
                        Proposed Replacement Formation
                      </div>
                      <div className="text-sm font-semibold text-[#E8EDF2]">
                        {activeMaster?.name}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-[#69BD91] bg-[#69BD91]/10 px-2 py-1 rounded border border-[#69BD91]/30">
                      100% Installed Stock
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                    {activeMaster?.slots.map((s, i) => (
                      <div
                        key={i}
                        className="p-2 rounded border border-[#252D36] bg-[#0E1115] text-xs font-mono flex items-center justify-between text-[#929DA9]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#65717E]">#{i + 1}</span>
                          <span className="font-semibold text-[#E8EDF2]">{s.label}</span>
                        </div>
                        <span className="text-[10px] text-[#79A997]">
                          {s.preferredSubCategory || s.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
