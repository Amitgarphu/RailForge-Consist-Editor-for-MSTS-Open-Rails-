/**
 * RailForge Consist - Main Application Workstation
 * @license Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ConsistFile,
  ConsistVehicleEntry,
  MasterConsist,
  StockCategory,
  VehicleItem,
  ViewportDisplayMode,
  TrainsetScanStats
} from './types/msts';
import { STARTER_MASTER_CONSISTS, buildConsistFromMaster } from './engine/masterConsistManager';
import { serializeConsist, sanitizeConsistFilename } from './engine/conSerializer';
import {
  getStoredDirectoryHandle,
  getStoredConsistsHandle,
  scanDirectoryHandle,
  scanConsistsDirectoryHandle,
  FullTrainsetScanResult
} from './engine/trainsetScanner';

// Layout & View Components
import { Header } from './components/layout/Header';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { ThreeViewport } from './components/viewport3d/ThreeViewport';
import { FormationTimeline } from './components/builder/FormationTimeline';
import { VehicleLibrary } from './components/builder/VehicleLibrary';
import { VehicleInspector } from './components/builder/VehicleInspector';
import { CatalogueView } from './components/catalogue/CatalogueView';
import { MasterConsistLibrary } from './components/master/MasterConsistLibrary';
import { RecoveryWorkbench } from './components/recovery/RecoveryWorkbench';
import { ConsistLibraryView } from './components/library/ConsistLibraryView';

// Modals
import { FolderSetupModal } from './components/setup/FolderSetupModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { AboutModal } from './components/about/AboutModal';

const STORAGE_KEY_MASTERS = 'railforge_master_consists';
const STORAGE_KEY_SAVED_CONSISTS = 'railforge_saved_consists';
const STORAGE_KEY_TRAINSET_PATH = 'railforge_trainset_path';
const STORAGE_KEY_CONSISTS_PATH = 'railforge_consists_path';

export default function App() {
  // Navigation & Modals
  const [activeTab, setActiveTab] = useState<ActiveTab>('builder');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFolderSetupOpen, setIsFolderSetupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Toast status notification (no window.alert)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Dual Directory Paths & Scan Stats
  const [trainsetPath, setTrainsetPath] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_TRAINSET_PATH) || '';
  });
  const [consistsPath, setConsistsPath] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_CONSISTS_PATH) || '';
  });
  const [scanStats, setScanStats] = useState<TrainsetScanStats | null>(null);

  // Separate Inventories:
  // A. Rolling Stock Inventory (.ENG and .WAG from TRAINSET)
  const [catalogue, setCatalogue] = useState<Map<string, VehicleItem>>(new Map());
  // B. Consist Inventory (.CON from CONSISTS + Saved Consists)
  const [scannedConsists, setScannedConsists] = useState<ConsistFile[]>([]);

  // Master Consists Store
  const [masterConsists, setMasterConsists] = useState<MasterConsist[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MASTERS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse stored master consists:', e);
    }
    return STARTER_MASTER_CONSISTS;
  });

  // Saved Consists Store
  const [savedConsists, setSavedConsists] = useState<ConsistFile[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SAVED_CONSISTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse stored consists:', e);
    }
    return [];
  });

  // Active Consist currently loaded in Consist Editor & Formation Timeline
  const [activeConsist, setActiveConsist] = useState<ConsistFile>(() => {
    return buildConsistFromMaster(STARTER_MASTER_CONSISTS[0], new Map());
  });

  // 3D Viewport Display Mode (Default: 'selected_vehicle' per TSRE5 single-vehicle requirement)
  const [viewportMode, setViewportMode] = useState<ViewportDisplayMode>('selected_vehicle');

  // Selected unit index in active consist
  const [selectedVehicleIndex, setSelectedVehicleIndex] = useState<number | null>(0);

  // Selected rolling-stock vehicle in the Rolling Stock Inventory
  const [selectedLibraryVehicle, setSelectedLibraryVehicle] = useState<VehicleItem | null>(null);

  // Track whether the right-side inspector is showing the clicked library vehicle or consist unit
  const [activeInspectionSource, setActiveInspectionSource] = useState<'library' | 'consist_unit'>(
    'consist_unit'
  );

  // Save stores to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MASTERS, JSON.stringify(masterConsists));
  }, [masterConsists]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SAVED_CONSISTS, JSON.stringify(savedConsists));
  }, [savedConsists]);

  // Combined Consists List (Scanned .CON files from CONSISTS + user saved consists)
  const allConsists = useMemo(() => {
    const map = new Map<string, ConsistFile>();
    for (const c of scannedConsists) {
      map.set(c.id.toLowerCase(), c);
    }
    for (const c of savedConsists) {
      map.set(c.id.toLowerCase(), c);
    }
    return Array.from(map.values());
  }, [scannedConsists, savedConsists]);

  // Update catalogue after scanning TRAINSET
  const handleScanComplete = useCallback(
    (
      vehicles: VehicleItem[],
      pathName: string,
      fullResult?: FullTrainsetScanResult,
      detectedConsistsPath?: string
    ) => {
      const map = new Map<string, VehicleItem>();
      vehicles.forEach((v) => map.set(v.id.toLowerCase(), v));
      setCatalogue(map);
      setTrainsetPath(pathName);
      localStorage.setItem(STORAGE_KEY_TRAINSET_PATH, pathName);

      if (fullResult) {
        setScanStats(fullResult.stats);
        if (fullResult.consists && fullResult.consists.length > 0) {
          setScannedConsists(fullResult.consists);
        }
      }

      if (detectedConsistsPath) {
        setConsistsPath(detectedConsistsPath);
        localStorage.setItem(STORAGE_KEY_CONSISTS_PATH, detectedConsistsPath);
      }

      // Select first primary vehicle for immediate single-vehicle preview if none selected
      if (vehicles.length > 0) {
        const firstPrimary = vehicles.find((v) => !v.isVariant) || vehicles[0];
        setSelectedLibraryVehicle(firstPrimary);
        setActiveInspectionSource('library');
        setViewportMode('selected_vehicle');
      }

      // Re-bind active consist to freshly scanned stock using exact (folder, filename) key
      setActiveConsist((prev) => {
        const updatedVehicles = prev.vehicles.map((v) => {
          const ext = v.type === 'engine' ? '.eng' : '.wag';
          const base = v.filename.replace(/\.(eng|wag)$/i, '');
          const key = `${v.folder}/${base}${ext}`.toLowerCase();
          const match = map.get(key);
          if (match) {
            return {
              ...v,
              name: match.name,
              category: match.category,
              subCategory: match.subCategory,
              lengthMeters: match.lengthMeters,
              massTons: match.massTons,
              isMissingInTrainset: false
            };
          }
          return { ...v, isMissingInTrainset: map.size > 0 };
        });

        return { ...prev, vehicles: updatedVehicles };
      });
    },
    []
  );

  const handleConsistsScanComplete = useCallback((consists: ConsistFile[], cPathName: string) => {
    setScannedConsists(consists);
    setConsistsPath(cPathName);
    localStorage.setItem(STORAGE_KEY_CONSISTS_PATH, cPathName);
    setScanStats((prev) => (prev ? { ...prev, conFilesDiscovered: consists.length } : prev));
  }, []);

  // Check stored IndexedDB handles on first launch
  useEffect(() => {
    async function initDirectories() {
      try {
        const tHandle = await getStoredDirectoryHandle();
        const cHandle = await getStoredConsistsHandle();

        if (tHandle) {
          setTrainsetPath(tHandle.name);
          const result = await scanDirectoryHandle(tHandle, undefined, cHandle);
          if (result.vehicles.length > 0) {
            handleScanComplete(
              result.vehicles,
              tHandle.name,
              result,
              cHandle?.name || result.stats.consistsPath
            );
          }
        } else if (cHandle) {
          setConsistsPath(cHandle.name);
          const consists = await scanConsistsDirectoryHandle(cHandle);
          handleConsistsScanComplete(consists, cHandle.name);
        }
      } catch (err) {
        console.warn('Could not restore stored directory handles:', err);
      }
    }

    initDirectories();
  }, [handleScanComplete, handleConsistsScanComplete]);

  // Rescan existing directory handles
  const handleRescanTrainset = async () => {
    try {
      const tHandle = await getStoredDirectoryHandle();
      const cHandle = await getStoredConsistsHandle();
      if (tHandle) {
        const result = await scanDirectoryHandle(tHandle, undefined, cHandle);
        handleScanComplete(
          result.vehicles,
          tHandle.name,
          result,
          cHandle?.name || result.stats.consistsPath
        );
        showToast(
          `Rescanned ${result.stats.logicalVehicleFamiliesCount} logical vehicles (${result.stats.rawSourceDefinitionsCount} raw files)`
        );
      } else {
        setIsFolderSetupOpen(true);
      }
    } catch {
      setIsFolderSetupOpen(true);
    }
  };

  // Clear directories
  const handleClearTrainset = () => {
    setCatalogue(new Map());
    setScannedConsists([]);
    setScanStats(null);
    setTrainsetPath('');
    setConsistsPath('');
    setSelectedLibraryVehicle(null);
    localStorage.removeItem(STORAGE_KEY_TRAINSET_PATH);
    localStorage.removeItem(STORAGE_KEY_CONSISTS_PATH);
    showToast('Cleared TRAINSET and CONSISTS directory bindings.');
  };

  // Select a vehicle in the left Rolling Stock Inventory -> preview in Single Vehicle 3D mode
  const handleSelectLibraryVehicle = (veh: VehicleItem) => {
    setSelectedLibraryVehicle(veh);
    setActiveInspectionSource('library');
    setViewportMode('selected_vehicle');
  };

  // Select a unit in the bottom Formation Timeline -> inspect & preview unit
  const handleSelectConsistUnit = (index: number | null) => {
    setSelectedVehicleIndex(index);
    if (index !== null) {
      setActiveInspectionSource('consist_unit');
      // If user is in single-vehicle mode, switch to 'selected_consist_unit' so the clicked unit is shown in 3D
      if (viewportMode === 'selected_vehicle') {
        setViewportMode('selected_consist_unit');
      }
    }
  };

  // TSRE5-Style "Replace Selected Unit" Action:
  // Substitutes ONLY the selected unit in the active consist while preserving all other units & order
  const handleReplaceSelectedUnit = useCallback(
    (replacementVehicle?: VehicleItem) => {
      const targetReplacement = replacementVehicle || selectedLibraryVehicle;
      if (!targetReplacement || selectedVehicleIndex === null) return;

      setActiveConsist((prev) => {
        if (!prev.vehicles[selectedVehicleIndex]) return prev;
        const existingUnit = prev.vehicles[selectedVehicleIndex];

        const baseFile = targetReplacement.filename.replace(/\.(eng|wag)$/i, '');
        const newEntry: ConsistVehicleEntry = {
          uid: existingUnit.uid,
          vehicleId: targetReplacement.id,
          filename: baseFile,
          folder: targetReplacement.folder,
          name: targetReplacement.name,
          type: targetReplacement.type,
          flipDirection: existingUnit.flipDirection,
          category: targetReplacement.category,
          subCategory: targetReplacement.subCategory,
          lengthMeters: targetReplacement.lengthMeters,
          massTons: targetReplacement.massTons,
          isMissingInTrainset: false
        };

        const updatedVehicles = [...prev.vehicles];
        updatedVehicles[selectedVehicleIndex] = newEntry;

        return {
          ...prev,
          vehicles: updatedVehicles
        };
      });

      setActiveInspectionSource('consist_unit');
      if (viewportMode === 'selected_vehicle') {
        setViewportMode('selected_consist_unit');
      }
      showToast(
        `Replaced Unit #${selectedVehicleIndex + 1} with ${targetReplacement.name} (${targetReplacement.folder}/${targetReplacement.filename})`
      );
    },
    [selectedLibraryVehicle, selectedVehicleIndex, viewportMode, showToast]
  );

  // Append Vehicle to Consist
  const handleAddVehicleToConsist = (veh: VehicleItem) => {
    const baseFile = veh.filename.replace(/\.(eng|wag)$/i, '');
    setActiveConsist((prev) => {
      const nextUid = prev.vehicles.length;
      const newEntry: ConsistVehicleEntry = {
        uid: nextUid,
        vehicleId: veh.id,
        filename: baseFile,
        folder: veh.folder,
        name: veh.name,
        type: veh.type,
        flipDirection: false,
        category: veh.category,
        subCategory: veh.subCategory,
        lengthMeters: veh.lengthMeters,
        massTons: veh.massTons,
        isMissingInTrainset: false
      };

      const updated = [...prev.vehicles, newEntry];
      return {
        ...prev,
        nextWagonUid: updated.length,
        vehicles: updated
      };
    });
    showToast(`Added ${veh.name} to consist (${activeConsist.vehicles.length + 1} units)`);
  };

  const handleMoveVehicle = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setActiveConsist((prev) => {
      const updated = [...prev.vehicles];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);

      const reindexed = updated.map((v, idx) => ({ ...v, uid: idx }));
      return { ...prev, vehicles: reindexed };
    });
    setSelectedVehicleIndex(toIndex);
  };

  const handleDuplicateVehicle = (index: number) => {
    setActiveConsist((prev) => {
      const target = prev.vehicles[index];
      if (!target) return prev;
      const copy: ConsistVehicleEntry = { ...target };
      const updated = [...prev.vehicles];
      updated.splice(index + 1, 0, copy);

      const reindexed = updated.map((v, idx) => ({ ...v, uid: idx }));
      return { ...prev, nextWagonUid: reindexed.length, vehicles: reindexed };
    });
    setSelectedVehicleIndex(index + 1);
  };

  const handleRemoveVehicle = (index: number) => {
    setActiveConsist((prev) => {
      const updated = prev.vehicles.filter((_, i) => i !== index);
      const reindexed = updated.map((v, idx) => ({ ...v, uid: idx }));
      return { ...prev, nextWagonUid: reindexed.length, vehicles: reindexed };
    });
    setSelectedVehicleIndex((prev) => {
      if (prev === null) return null;
      if (prev >= index) return Math.max(0, prev - 1);
      return prev;
    });
  };

  const handleFlipVehicle = (index: number) => {
    setActiveConsist((prev) => {
      const updated = [...prev.vehicles];
      if (updated[index]) {
        updated[index] = { ...updated[index], flipDirection: !updated[index].flipDirection };
      }
      return { ...prev, vehicles: updated };
    });
  };

  const handleUpdateVehicleCategory = (newCat: StockCategory, newSub: string) => {
    if (selectedVehicleIndex === null) return;
    setActiveConsist((prev) => {
      const updated = [...prev.vehicles];
      if (updated[selectedVehicleIndex]) {
        updated[selectedVehicleIndex] = {
          ...updated[selectedVehicleIndex],
          category: newCat,
          subCategory: newSub
        };
      }
      return { ...prev, vehicles: updated };
    });
  };

  // Save current active consist as Master Consist
  const handleSaveAsMaster = () => {
    const newMaster: MasterConsist = {
      id: `master_${Date.now()}`,
      name: `${activeConsist.name} Master`,
      description: `User-created master consist with ${activeConsist.vehicles.length} vehicles.`,
      stockCategory: 'Global',
      coachFamily: 'Generic',
      serviceType: 'Express',
      keywords: ['Custom', activeConsist.name],
      vehicleCount: activeConsist.vehicles.length,
      updatedAt: Date.now(),
      slots: activeConsist.vehicles.map((v, i) => ({
        id: `slot_${i}`,
        label: v.name,
        expectedType: v.type,
        category: v.category,
        preferredSubCategory: v.subCategory,
        assignedVehicleId: v.vehicleId,
        flipDirection: v.flipDirection
      }))
    };

    setMasterConsists((prev) => [newMaster, ...prev]);
    showToast(`Saved "${newMaster.name}" to Master Consist Library.`);
  };

  // Export current active consist as genuine .CON file (Safe Copy — never overwrites original)
  const handleExportCon = () => {
    const serialized = serializeConsist(activeConsist);
    const blob = new Blob([serialized], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeConsist.filename.endsWith('.con')
      ? activeConsist.filename
      : `${activeConsist.filename}.con`;
    a.click();
    URL.revokeObjectURL(url);

    setSavedConsists((prev) => {
      const existing = prev.filter((c) => c.id !== activeConsist.id);
      return [activeConsist, ...existing];
    });
    showToast(`Exported ${activeConsist.filename} safely.`);
  };

  // Load a consist into the 3D builder
  const handleOpenInBuilder = (consist: ConsistFile) => {
    setActiveConsist(consist);
    setSelectedVehicleIndex(0);
    setActiveInspectionSource('consist_unit');
    setActiveTab('builder');
  };

  // Resolve selected consist unit against canonical catalogue
  const selectedVehicle =
    selectedVehicleIndex !== null ? activeConsist.vehicles[selectedVehicleIndex] : null;

  const selectedVehicleItem = useMemo(() => {
    if (!selectedVehicle) return undefined;
    const ext = selectedVehicle.type === 'engine' ? '.eng' : '.wag';
    const base = selectedVehicle.filename.replace(/\.(eng|wag)$/i, '');
    const key = `${selectedVehicle.folder}/${base}${ext}`.toLowerCase();
    return catalogue.get(key) || catalogue.get(selectedVehicle.vehicleId.toLowerCase());
  }, [selectedVehicle, catalogue]);

  const catalogueList = useMemo(() => Array.from(catalogue.values()), [catalogue]);
  const logicalStockCount = useMemo(
    () => catalogueList.filter((v) => !v.isVariant).length,
    [catalogueList]
  );

  const viewTitles: Record<ActiveTab, string> = {
    builder: 'TSRE5 Consist Editor & 3D Vehicle Viewport',
    catalogue: 'Rolling Stock Inventory (TRAINSET)',
    master: 'Master Consist Templates',
    recovery: 'Safe Consist Recovery Workbench',
    library: 'Consist Library (.CON)'
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090B0D] text-[#E8EDF2] overflow-hidden select-none font-sans">
      {/* Top Bar Header */}
      <Header
        trainsetPath={trainsetPath}
        consistsPath={consistsPath}
        logicalVehicleCount={logicalStockCount}
        rawVehicleCount={catalogue.size}
        consistCount={allConsists.length}
        onOpenFolderSetup={() => setIsFolderSetupOpen(true)}
        onRescanTrainset={handleRescanTrainset}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        activeViewTitle={viewTitles[activeTab]}
      />

      {/* Non-intrusive Engineering Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1A2028] border border-[#79A997] text-[#E8EDF2] px-4 py-2 rounded shadow-2xl text-xs font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#69BD91]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Workspace with Collapsible Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          stockCount={logicalStockCount}
          recoveryCount={0}
        />

        {/* Viewport & View Panels */}
        <main className="flex-1 flex overflow-hidden bg-[#0E1115]">
          {activeTab === 'builder' && (
            /* 3-Panel Consist Builder */
            <div className="flex w-full h-full overflow-hidden">
              {/* LEFT: Dual-Tab Rolling Stock & Consist Inventory Browser */}
              <div className="w-[310px] shrink-0 h-full">
                <VehicleLibrary
                  vehicles={catalogueList}
                  consists={allConsists}
                  selectedLibraryVehicleId={selectedLibraryVehicle?.id || null}
                  selectedConsistUnitIndex={selectedVehicleIndex}
                  activeConsistId={activeConsist.id}
                  onSelectLibraryVehicle={handleSelectLibraryVehicle}
                  onAddVehicle={handleAddVehicleToConsist}
                  onReplaceSelectedUnit={(veh) => handleReplaceSelectedUnit(veh)}
                  onSelectConsistFile={(con) => {
                    setActiveConsist(con);
                    setSelectedVehicleIndex(0);
                    setActiveInspectionSource('consist_unit');
                    setViewportMode('selected_consist_unit');
                    showToast(`Loaded consist "${con.name}" (${con.vehicles.length} units)`);
                  }}
                  trainsetLoaded={catalogue.size > 0}
                  onOpenFolderSetup={() => setIsFolderSetupOpen(true)}
                />
              </div>

              {/* CENTER: 3D Viewport on Top + Formation Timeline Strip Below */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="flex-1 relative overflow-hidden">
                  <ThreeViewport
                    consist={activeConsist}
                    selectedVehicleIndex={selectedVehicleIndex}
                    onSelectVehicle={handleSelectConsistUnit}
                    selectedLibraryVehicle={selectedLibraryVehicle}
                    installedCatalogue={catalogue}
                    viewportMode={viewportMode}
                    onChangeViewportMode={setViewportMode}
                  />
                </div>

                <FormationTimeline
                  consist={activeConsist}
                  selectedVehicleIndex={selectedVehicleIndex}
                  selectedLibraryVehicle={selectedLibraryVehicle}
                  onSelectVehicle={handleSelectConsistUnit}
                  onMoveVehicle={handleMoveVehicle}
                  onDuplicateVehicle={handleDuplicateVehicle}
                  onRemoveVehicle={handleRemoveVehicle}
                  onFlipVehicle={handleFlipVehicle}
                  onReplaceSelectedUnit={() => handleReplaceSelectedUnit()}
                  onOpenLibraryAdd={() => {
                    if (selectedLibraryVehicle) {
                      handleAddVehicleToConsist(selectedLibraryVehicle);
                    }
                  }}
                />
              </div>

              {/* RIGHT: Selected Vehicle / Consist Technical Inspector */}
              <div className="w-[335px] shrink-0 h-full">
                <VehicleInspector
                  consist={activeConsist}
                  selectedVehicle={selectedVehicle}
                  selectedVehicleIndex={selectedVehicleIndex}
                  selectedVehicleItem={selectedVehicleItem}
                  selectedLibraryVehicle={selectedLibraryVehicle}
                  activeInspectionSource={activeInspectionSource}
                  onReplaceSelectedUnit={(veh) => handleReplaceSelectedUnit(veh)}
                  onUpdateConsistName={(name) => {
                    setActiveConsist((prev) => ({
                      ...prev,
                      name,
                      filename: `${sanitizeConsistFilename(name)}.con`
                    }));
                  }}
                  onUpdateVehicleCategory={handleUpdateVehicleCategory}
                  onSaveAsMaster={handleSaveAsMaster}
                  onExportCon={handleExportCon}
                />
              </div>
            </div>
          )}

          {activeTab === 'catalogue' && (
            <CatalogueView
              vehicles={catalogueList}
              scanStats={scanStats}
              onAddVehicleToConsist={(veh) => {
                handleAddVehicleToConsist(veh);
              }}
              onInspectVehicleIn3D={(veh) => {
                setSelectedLibraryVehicle(veh);
                setActiveInspectionSource('library');
                setViewportMode('selected_vehicle');
                setActiveTab('builder');
              }}
              onOpenFolderSetup={() => setIsFolderSetupOpen(true)}
            />
          )}

          {activeTab === 'master' && (
            <MasterConsistLibrary
              masterConsists={masterConsists}
              catalogue={catalogue}
              onSelectMasterForBuilder={handleOpenInBuilder}
              onUpdateMasterConsists={setMasterConsists}
            />
          )}

          {activeTab === 'recovery' && (
            <RecoveryWorkbench
              masterConsists={masterConsists}
              catalogue={catalogue}
              onSaveConsistToLibrary={(consist) => {
                setSavedConsists((prev) => [consist, ...prev.filter((c) => c.id !== consist.id)]);
              }}
            />
          )}

          {activeTab === 'library' && (
            <ConsistLibraryView
              savedConsists={allConsists}
              onOpenInBuilder={handleOpenInBuilder}
              onDeleteConsist={(id) => {
                setSavedConsists((prev) => prev.filter((c) => c.id !== id));
                setScannedConsists((prev) => prev.filter((c) => c.id !== id));
              }}
            />
          )}
        </main>
      </div>

      {/* Dual Directory Setup Wizard Modal */}
      <FolderSetupModal
        isOpen={isFolderSetupOpen}
        onClose={() => setIsFolderSetupOpen(false)}
        onScanComplete={handleScanComplete}
        onConsistsScanComplete={handleConsistsScanComplete}
        currentPath={trainsetPath}
        currentConsistsPath={consistsPath}
        installedVehicles={catalogueList}
      />

      {/* Settings & Regression Verification Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        trainsetPath={trainsetPath}
        consistsPath={consistsPath}
        scanStats={scanStats}
        onOpenFolderSetup={() => setIsFolderSetupOpen(true)}
        onRescanTrainset={handleRescanTrainset}
        onClearTrainset={handleClearTrainset}
      />

      {/* About Modal */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
}
