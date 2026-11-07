/**
 * RailForge Consist - About Modal
 * @license Apache-2.0
 */

import React, { useState } from 'react';
import { X, Copy, Check, Train, Cpu, ShieldCheck } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyDiscord = () => {
    navigator.clipboard.writeText('_anshuman_45_');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-[#14191F] border border-[#252D36] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#252D36] bg-[#0E1115]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#1A2028] text-[#79A997] rounded border border-[#252D36]">
              <Train className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[#E8EDF2] tracking-wider uppercase">
              About RailForge Consist
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#65717E] hover:text-[#E8EDF2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-center">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-[#E8EDF2] font-heading">
              RAILFORGE CONSIST
            </h2>
            <p className="text-xs font-semibold tracking-widest text-[#79A997] uppercase font-mono">
              Build. Assemble. Run.
            </p>
          </div>

          <p className="text-xs text-[#929DA9] leading-relaxed text-left bg-[#0E1115] p-3.5 rounded border border-[#252D36]">
            RailForge Consist is a desktop-first engineering workstation for Microsoft Train Simulator (MSTS) and Open Rails. It provides local Trainset folder indexing, high-performance 3D consist visualization, formation-aware fuzzy matching, and non-destructive recovery of broken consists.
          </p>

          <div className="pt-2 border-t border-[#252D36] text-left space-y-3">
            <div className="text-xs text-[#929DA9]">
              <span className="text-[#65717E] block text-[10px] uppercase font-bold tracking-wider">Created By</span>
              <span className="text-sm font-semibold text-[#E8EDF2]">Anshuman Sharma</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-[#0E1115] border border-[#252D36] rounded text-xs">
              <div>
                <span className="text-[10px] text-[#65717E] uppercase block font-semibold">Discord Contact</span>
                <span className="font-mono text-[#E8EDF2] font-medium">_anshuman_45_</span>
              </div>

              <button
                onClick={handleCopyDiscord}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A2028] hover:bg-[#252D36] text-[#79A997] border border-[#252D36] rounded text-xs font-medium transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#69BD91]" />
                    <span className="text-[#69BD91]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-[10px] text-[#65717E] font-mono">
            Version 1.0.0-PRO · Native File System Access & 3D WebGL Engine
          </div>
        </div>
      </div>
    </div>
  );
};
