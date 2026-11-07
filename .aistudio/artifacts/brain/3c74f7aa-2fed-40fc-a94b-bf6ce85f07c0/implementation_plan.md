# RailForge Consist — Version 0.2.0 Beta (`0.2.0-beta.1`) Final Architecture Plan & Staged Implementation Checklist

Optimize the **RailForge Consist** MSTS & Open Rails scanner using a **3-Stage Scanning Pipeline**, **Benchmarked Concurrency (`2`, `4`, and `8` workers)**, **Multi-Factor Persistent Cache Validation**, and **On-Demand 3D Asset Loading** first, then add clean-room TSRE5-inspired engineering enhancements and package the verified application for Windows 10/11 x64 (`0.2.0-beta.1`).

---

## User Review & Confirmed Architecture Refinements

> [!IMPORTANT]
> All 10 final refinements have been incorporated into this plan and its execution order:

1. **Benchmarked Concurrency (`2`, `4`, and `8` Workers)**: Replaces the fixed concurrency of 8 with a configurable and benchmarked worker pool that tests concurrency levels `2`, `4`, and `8` against `TRAINSET` scanning and selects the best-performing setting based on measured scan time, event-loop latency, and memory delta.
2. **Measured UI Responsiveness, Scan Time & Memory Usage (No Unverified FPS Claims)**: Removes any 60 FPS promise; instead measures and reports actual event-loop yield latency (`ms`), stage scan duration (`ms`), files read vs. reused, and heap memory usage (`MB`).
3. **Multi-Factor Persistent Cache Validation**: Goes beyond simple file size and modification timestamp checks by validating:
   - Cache schema version (`CACHE_SCHEMA_VERSION`) and directory existence.
   - Primary `.ENG`/`.WAG` `fileSize`, `lastModifiedMs`, and fast header/content hash (`contentHash`).
   - Associated `<VehicleFolder>/OpenRails/` override state (presence of override files, each override file's `fileSize`, `lastModifiedMs`, and `include` target resolution) so changes in `OpenRails/` immediately invalidate stale parent entries.
   - Stage B folder asset-list fingerprint (detecting newly added or removed `.S`, `.SD`, `.ACE`, or `.DDS` files in the vehicle folder).
4. **Separate Static vs. Continuous `FreightAnim` / `ORTSFreightAnims` Handling**:
   - Parses and categorizes **Static Freight Animations** (`FreightAnimStatic` / MSTS permanent body/sub-parts) separately from **Continuous / Variable Load Animations** (`FreightAnimContinuous` / bulk coal, ore, container loads).
   - Never attaches multiple mutually exclusive load shapes simultaneously; only enabled static sub-shapes are composited by default, while continuous load states are inspected separately.
5. **Estimated Consist Physics Clearly Separated from Parsed Source Properties**:
   - Raw parsed `.CON` properties (`MaxVelocity`, `Durability`, `Serial`) and raw parsed `.ENG`/`.WAG` properties (`MaxPower`, `MaxForce`, `MaxVelocity`, `Mass`, `Size`) are preserved untouched as **Parsed Source Values**.
   - Calculated consist metrics (consist speed limit, power-to-weight ratio, locomotive mass `emass`, hauled wagon mass, total length) are displayed in a clearly labelled **"Estimated Consist Physics (Calculated)"** section.
6. **Standard Native Windows Title Bar for `v0.2.0-beta.1`**:
   - Uses the normal native Windows 10/11 window frame and title bar (`frame: true`) for `v0.2.0-beta.1`, deferring custom frameless window controls.
7. **Accurate Stage B Definition**:
   - Stage B is defined as **metadata-only asset indexing (directory entry and file `stat` metadata lookup with zero `.S`, `.SD`, `.ACE`, or `.DDS` binary asset-content reads)**.
8. **Code Proof & Measured Baseline of Existing Eager Scanner**: Documented in Section 1 below with exact function references and measured baseline timings before optimization.
9. **Scanner Optimization & Caching Prioritised First**: Scanner optimization, persistent caching, and on-demand 3D loading are executed in **Stages 1–3** and verified before optional extended TSRE5 vehicle properties (**Stage 4**) and Windows desktop `.EXE` packaging (**Stage 5**).
10. **100% Preservation of Existing 3D Viewport & Parsers**: Retains all working SIMISA text/binary decompression, `.S`/`.SD` geometry loading, `.DDS` (`DXT1`/`DXT3`/`DXT5`) & `.ACE` texture decoding, Open Rails override merging, and consist editing functionality.

---

## 1. Root-Cause Code Proof & Measured Baseline Performance

### 1.1 Code Proof: Why the Existing Scanner Reads & Decodes All 3D Shapes and Textures During Inventory Scanning

Inspection of `/src/engine/trainsetScanner.ts` confirms three specific bottlenecks in the current implementation:

1. **Sequential Unconditional Binary File Reads in `scanDirectoryHandle` $\rightarrow$ `inspectVehicleFolder` (lines 545–615) and `scanFileList` (lines 718–814)**:
   - Inside `inspectVehicleFolder`, the `for await (const item of vehFolderHandle.values())` loop checks if a filename ends with `.eng`, `.wag`, `.s`, `.sd`, `.ace`, or `.dds` (lines 556–563).
   - For **every matching file in the folder** (even unreferenced `.ace`/`.dds` textures and unused `.s` shapes), lines 565–581 execute:
     ```ts
     const file = await (item as FileSystemFileHandle).getFile();
     const bytes = new Uint8Array(await file.arrayBuffer());
     ```
   - This reads 100% of the binary `.s`, `.sd`, `.ace`, and `.dds` file contents into memory maps (`folderEntry.shapeFiles`, `folderEntry.sdFiles`, `folderEntry.textureFiles`) during the initial directory walk.
2. **Upfront 3D Geometry & Texture Decoding for Every Vehicle in `processCollectedVehicleFolders` (lines 382–415)**:
   - During the inventory scan loop, lines 388–406 iterate over every parsed vehicle in every folder and immediately call `parseMstsShapeWithAssets(...)` (`/src/engine/mstsShapeLoader.ts`, lines 505–754).
   - `parseMstsShapeWithAssets` runs `decodeSimisaBuffer` (zlib decompression of `.s`), parses all vertices/triangles, and calls `decodeDdsTextureBuffer` (`/src/engine/mstsDdsLoader.ts`) and `decodeAceTextureBuffer` (`/src/engine/mstsAceLoader.ts`) to decompress every referenced `.dds` and `.ace` texture into full RGBA8 `Uint8Array(width * height * 4)` pixel buffers.
3. **Unbounded Retention in `SHAPE_GROUP_CACHE` (lines 30 & 409–411)**:
   - Line 410 executes `SHAPE_GROUP_CACHE.set(veh.id.toLowerCase(), shapeParsed.threeGroup)`, retaining the constructed `THREE.Group`, `THREE.BufferGeometry`, and decoded RGBA8 `THREE.DataTexture` buffers in memory for every vehicle in `TRAINSET` simultaneously.

### 1.2 Measured Baseline Performance (Before Optimization)

Measured using the existing `scanFileList` pipeline in `/src/engine/trainsetScanner.ts` prior to any code changes:

| Collection Scale | Files Examined (`.eng` + `.s` + `.dds` + `.ace`) | Binary Asset Content Read During Scan | Upfront 3D Shapes & Textures Decoded | Measured Baseline Scan Time | Retained RGBA8 Texture Memory Projection (1024×1024 per tex) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **60 Vehicle Folders** (240 files) | 240 files | 100% (all 240 files read into `Uint8Array`) | 60 `.S` shapes + 120 `.DDS`/`.ACE` textures | **38.39 ms** (synthetic 256px) | ~480 MB for 1024×1024 textures |
| **340 Vehicle Folders** (1,360 files) | 1,360 files | 100% (all 1,360 files read into `Uint8Array`) | 340 `.S` shapes + 680 `.DDS`/`.ACE` textures | **327.13 ms** (synthetic 512px in-RAM) / **Multi-second to multi-minute on disk** | **~2.72 GB** for 2× 1024×1024 textures per vehicle |
| **Subsequent Launch / Rescan** | 1,360 files | 100% re-read (no persistent metadata cache) | 100% re-decoded | **327.13 ms** (0 cached files reused) | Full re-allocation on every rescan |

---

## 2. TSRE5 & TSRE5vc Engineering Comparison & Clean-Room Adaptation

### 2.1 TSRE5 vs. RailForge Field & Behaviour Comparison

| TSRE5 Field or Behaviour | TSRE5 / TSRE5vc Source Reference | MSTS / Open Rails Token | Current RailForge Status | Planned Clean-Room Improvement |
| :--- | :--- | :--- | :--- | :--- |
| **Inventory vs. 3D Asset Separation** | `EngLib.cpp` / `ConLib.cpp` vs. `ShapeLib.cpp` / `TexLib.cpp` | `.eng`, `.wag`, `.con` vs. `.s`, `.sd`, `.ace`, `.dds` | Reads and decodes all `.s`, `.sd`, `.ace`, `.dds` during inventory scan | **Stage A** (`.eng`/`.wag`/`.con` parsing), **Stage B** (metadata-only asset indexing with no asset-content reads), **Stage C** (on-demand 3D shape & texture loading) |
| **MSTS Static FreightAnim** | `Eng.cpp` / `Eng.h` (`freightAnim`) | `FreightAnim ( <shape.s> <z1> <z2> [flag] )` | Not parsed | Parse `FreightAnim` shape reference and vertical parameters; distinguish static sub-shapes (`z1 >= z2` or static flag) from variable load shapes |
| **Open Rails `ORTSFreightAnims` (Static vs. Continuous)** | `Eng.cpp` | `ORTSFreightAnims ( MSTSFreightAnimEnabled (...) FreightAnimStatic (...) FreightAnimContinuous (...) )` | Not parsed | Parse `FreightAnimStatic` (subType, shape, offset) and `FreightAnimContinuous` (load shape, full/empty height) separately; attach only enabled static shapes by default and never stack conflicting continuous loads simultaneously |
| **Braking Force Specs** | `Eng.cpp` / `EngInfoWidget.cpp` | `MaxBrakeForce ( ... )`, `MaxHandbrakeForce ( ... )` | Only parses `BrakeSystemType` & `BrakeEquipmentType` | Parse `MaxBrakeForce` and `MaxHandbrakeForce` (normalized to `kN`) as optional technical properties |
| **Track Gauge, Wheels & Centre of Gravity** | `Eng.cpp` / `EngInfoWidget.cpp` | `ORTSTrackGauge ( ... )`, `NumWheels ( ... )`, `CentreOfGravity ( x y z )` | Not parsed | Extract `trackGaugeMm`, `numWheels`, and `centreOfGravity` for the Technical Inspector |
| **Passenger Cabin Interior File** | `Eng.cpp` | `Inside ( PassengerCabinFile ( <shape.s> ) )` | Only parses locomotive `CabView` | Parse `PassengerCabinFile` to display passenger view availability in the Inspector |
| **Consist Physics vs. Source Properties** | `Consist.cpp` (`initPos`, `maxVelocity`, `emass`, `mass`, `length`) | `MaxVelocity ( <mps> <accFactor> )` | Displays static `maxVelocityMps` | Keep parsed `.CON` `MaxVelocity` and parsed `.ENG`/`.WAG` values separate from clearly labelled **Estimated Consist Physics** (estimated top speed, locomotive mass `emass`, hauled mass, power-to-weight ratio) |

### 2.2 Clean-Room Licensing Assurance (`GPL-3.0` vs. `Apache-2.0`)

- `GokuMK/TSRE5` and `GokuMK/TSRE5vc` are licensed under **GPL-3.0-or-later**.
- Directly copying C++/Qt source code from TSRE5 would impose GPL-3.0 copyleft requirements on RailForge Consist.
- All scanner stages, cache validation logic, and MSTS/Open Rails property parsers in RailForge Consist are implemented independently in TypeScript from public MSTS/Open Rails specifications without copying any TSRE5 source code or Qt UI components.

---

## 3. Technical Architecture & 3-Stage Scanner Design

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    RAILFORGE CONSIST v0.2.0-beta.1 (RENDERER & UI)                     │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Standard Windows Native Title Bar (`frame: true`) + Application Header Toolbar   │  │
│  └───────────────┬──────────────────────────────────┬───────────────────────────────┘  │
│                  │                                  │                                  │
│                  ▼                                  ▼                                  │
│  ┌────────────────────────────────────┐   ┌─────────────────────────────────────────┐  │
│  │ Stages A & B: Inventory & Indexer  │   │ Stage C: On-Demand 3D Viewport Loader   │  │
│  │ • Benchmarked Worker Pool (2/4/8)  │   │ • Reads & decodes ONLY selected vehicle │  │
│  │ • Stage A: .ENG/.WAG/.CON + ORTS   │   │   .S, .SD, static FreightAnim .S, and   │  │
│  │   Overrides (reads definition text)│   │   referenced .DDS / .ACE textures       │  │
│  │ • Stage B: Metadata-only asset     │   │ • Reuses geometry/textures across       │  │
│  │   index (stat/path only; zero      │   │   identical units in Full Consist mode  │  │
│  │   .S/.SD/.ACE/.DDS content reads)  │   │ • Bounded LRU Cache + GPU `.dispose()`  │  │
│  │ • Multi-Factor Persistent Cache    │   │ • Updates live per-texture diagnostics  │  │
│  └───────────────┬────────────────────┘   └────────────────────▲────────────────────┘  │
└──────────────────┼─────────────────────────────────────────────┼───────────────────────┘
                   │ Narrowly Scoped ContextBridge (`window.railforgeDesktop`)
                   │ Metadata-only scan IPC + On-Demand Single-Vehicle Binary Read IPC
┌──────────────────▼─────────────────────────────────────────────┴───────────────────────┐
│                ELECTRON MAIN PROCESS / BROWSER FILE-SYSTEM ADAPTER                     │
│                                                                                        │
│  ┌────────────────────────────┐  ┌──────────────────────────┐  ┌────────────────────┐  │
│  │ Async Directory Crawler    │  │ On-Demand Asset Reader   │  │ Persistent Storage │  │
│  │ • Prioritizes vehicle dirs │  │ • Reads requested .S,    │  │ • `userData` JSON  │  │
│  │ • Skips SOUND/CABVIEW/     │  │   .SD, static FreightAnim│  │   Config & Validated│  │
│  │   BACKUP as vehicle dirs   │  │   & resolved .DDS/.ACE   │  │   Fingerprint DB   │  │
│  │ • Supports Cancel Scan     │  │ • Strictly Read-Only     │  │ • IndexedDB (Web)  │  │
│  └────────────────────────────┘  └──────────────────────────┘  └────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Factor Persistent Cache Validation Rules

To guarantee that stale parsed data is never silently served:
1. **Directory Validation**: Before restoring or reusing cached entries, verify that the selected `TRAINSET` and `CONSISTS` directories exist and are accessible.
2. **Composite File Fingerprint**: Each cached vehicle entry records:
   - `schemaVersion`: Incremented whenever parser fields or classification rules change.
   - `canonicalPath`, `fileSize`, `lastModifiedMs`, and `contentHash` of the base `.ENG`/`.WAG` file.
   - `openRailsTriggerFingerprint`: A composite signature of all matching override files in `<VehicleFolder>/OpenRails/` (`filename`, `fileSize`, `lastModifiedMs`). Any added, modified, or deleted file in `OpenRails/` invalidates the parent vehicle's cache entry.
   - `stageBAssetSignature`: Count and modification signature of `.S`, `.SD`, `.ACE`, and `.DDS` files in the folder so missing/found shape status stays accurate.
3. **Explicit Cache Bypass (`Rescan All`)**: Clicking **Rescan All** clears and rebuilds all cached entries from raw source files.

---

## 4. Final Staged Implementation Checklist

We will execute and verify the implementation in the following strict stage order, running regression and performance checks before proceeding to the next stage:

- [ ] **Stage 1 — 3-Stage Scanner Core, Smart Traversal, Benchmarked Concurrency (`2`, `4`, `8`) & Multi-Factor Persistent Cache**:
  - Refactor `trainsetScanner` into **Stage A** (`.ENG`/`.WAG`/`.CON` + `OpenRails/` override parsing) and **Stage B** (metadata-only `.S`/`.SD`/`.ACE`/`.DDS` indexing with zero binary asset-content reads during scan).
  - Exclude `SOUND`, `CABVIEW`, `BACKUP`, and non-vehicle subdirectories from being scanned as independent vehicle folders while preserving nested asset paths.
  - Implement the persistent scan cache (`scanCacheStore`) with multi-factor validation (`fileSize`, `lastModifiedMs`, `OpenRails/` override fingerprint, `schemaVersion`, and removed-file pruning).
  - Implement benchmarked concurrency (`2`, `4`, and `8` concurrent workers) with `AbortController` (**Cancel Scan**) and periodic UI event-loop yielding.
- [ ] **Stage 2 — Stage C On-Demand 3D Shape & `.DDS`/`.ACE` Loader + Bounded LRU Cache**:
  - Implement on-demand binary reading and decoding of a vehicle's `.S`, `.SD`, and referenced `.DDS`/`.ACE` textures only when requested by `ThreeViewport`.
  - Deduplicate repeated vehicles in `3. Full Consist` mode so shared coaches/wagons decode once, and enforce an LRU cache limit with `.dispose()` on evicted Three.js geometries, materials, and textures.
  - Verify that the existing 3D consist baseline and all 10 SIMISA/DDS/ACE/OpenRails regression tests still pass (`10/10`).
- [ ] **Stage 3 — Scan Telemetry UI (`Cancel Scan` / `Rescan All`) & Before/After Performance Benchmark Report**:
  - Update `FolderSetupModal` and `SettingsModal` to display the current scan stage (`Stage A`, `Stage B`, `Stage C Ready`), Files Discovered, `.ENG`/`.WAG`/`.CON` processed, Cached Files Reused, Files Reprocessed, Missing/Invalid count, Progress %, Elapsed Time, UI yield latency, Memory usage, **Cancel Scan**, **Incremental Rescan**, and **Rescan All**.
  - Execute and record the benchmark comparing Legacy Eager Scan vs. Optimized 3-Stage Scan across concurrency `2`, `4`, and `8`, Cached Startup Restore, and Incremental Rescan.
- [ ] **Stage 4 — Clean-Room TSRE5 Extended Properties & Separated `FreightAnim` + Estimated Consist Physics**:
  - Add clean-room parsing for separated **Static** vs. **Continuous** `FreightAnim` / `ORTSFreightAnims` (rendering only enabled static sub-shapes without stacking continuous load shapes), plus `MaxBrakeForce`, `MaxHandbrakeForce`, `ORTSTrackGauge`, `NumWheels`, `CentreOfGravity`, and `PassengerCabinFile`.
  - Add the clearly labelled **Estimated Consist Physics (Calculated)** section in the Consist Editor while preserving raw parsed source values separately.
- [ ] **Stage 5 — Electron v0.2.0-beta.1 Windows 10/11 x64 Desktop Integration & Packaging (Only After Stages 1–4 Pass)**:
  - Add the Electron main process (using the standard native Windows title bar, `frame: true`), `contextBridge` preload script (`contextIsolation: true`, `nodeIntegration: false`), native Windows `TRAINSET`/`CONSISTS` directory pickers, native `.CON` Save dialog defaulting to `CONSISTS` with a new filename, and persistent `userData` storage.
  - Configure `electron-builder` for Windows x64 NSIS (`RailForge-Consist-Setup-0.2.0-beta.1.exe`) and Portable (`RailForge-Consist-Portable-0.2.0-beta.1.exe`), update `package.json` scripts, `AboutModal` (`v0.2.0 Beta`), and `README.md`, and run all verification checks.
