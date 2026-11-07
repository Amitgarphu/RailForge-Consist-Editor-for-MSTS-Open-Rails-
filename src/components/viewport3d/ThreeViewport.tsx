/**
 * RailForge Consist - Interactive 3D Vehicle & Consist Engineering Viewport
 * @license Apache-2.0
 *
 * Supports three explicit display modes (inspired by TSRE5 Consist Editor):
 * 1. Selected Vehicle (Default) - Isolated single-vehicle preview from Rolling Stock Inventory
 * 2. Selected Consist Unit      - Isolated preview of the active unit in the Consist Formation
 * 3. Full Consist Preview       - Complete multi-unit rake formation on continuous track
 *
 * Preserves the working 3D consist renderer while adding authentic .S + .DDS/.ACE mesh
 * rendering when scanned from TRAINSET, plus dimension-locked diagnostic fallback.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ConsistFile,
  ConsistVehicleEntry,
  VehicleItem,
  ViewportDisplayMode
} from '../../types/msts';
import { buildRailwayTrack, buildVehicle3D } from './proceduralTrainsetMesh';
import { getLoadedShapeGroupForVehicle } from '../../engine/trainsetScanner';
import {
  Maximize2,
  RotateCcw,
  Grid,
  Focus,
  Sun,
  X,
  Ruler,
  Box,
  Layers,
  Train
} from 'lucide-react';

interface ThreeViewportProps {
  consist: ConsistFile;
  selectedVehicleIndex: number | null;
  onSelectVehicle: (index: number | null) => void;
  selectedLibraryVehicle?: VehicleItem | null;
  installedCatalogue?: Map<string, VehicleItem>;
  viewportMode?: ViewportDisplayMode;
  onChangeViewportMode?: (mode: ViewportDisplayMode) => void;
}

function getCompassHeading(azimuth: number): string {
  if (azimuth >= 337.5 || azimuth < 22.5) return 'N';
  if (azimuth >= 22.5 && azimuth < 67.5) return 'NE';
  if (azimuth >= 67.5 && azimuth < 112.5) return 'E';
  if (azimuth >= 112.5 && azimuth < 157.5) return 'SE';
  if (azimuth >= 157.5 && azimuth < 202.5) return 'S';
  if (azimuth >= 202.5 && azimuth < 247.5) return 'SW';
  if (azimuth >= 247.5 && azimuth < 292.5) return 'W';
  return 'NW';
}

/**
 * Convert a standalone VehicleItem from the Rolling Stock Inventory into a ConsistVehicleEntry for 3D rendering
 */
function vehicleItemToEntry(item: VehicleItem): ConsistVehicleEntry {
  return {
    uid: 0,
    vehicleId: item.id,
    filename: item.filename.replace(/\.(eng|wag)$/i, ''),
    folder: item.folder,
    name: item.name,
    type: item.type,
    flipDirection: false,
    category: item.category,
    subCategory: item.subCategory,
    lengthMeters: item.lengthMeters,
    massTons: item.massTons
  };
}

/**
 * Build a CAD-style 3D dimension callout wireframe box for an isolated vehicle
 */
function buildDimensionCalloutBox(
  width: number,
  height: number,
  length: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dimension_callout_group';

  const boxGeo = new THREE.BoxGeometry(width, height, length);
  const edges = new THREE.EdgesGeometry(boxGeo);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x79a997,
    transparent: true,
    opacity: 0.55
  });
  const wireframe = new THREE.LineSegments(edges, lineMat);
  wireframe.position.set(0, height / 2, 0);
  group.add(wireframe);

  // Base measurement ticks at front and rear
  const tickMat = new THREE.LineBasicMaterial({ color: 0xd6a85b, transparent: true, opacity: 0.75 });
  const halfL = length / 2;
  const halfW = width / 2 + 0.6;

  const points = [
    new THREE.Vector3(-halfW, 0.05, halfL),
    new THREE.Vector3(halfW, 0.05, halfL),
    new THREE.Vector3(-halfW, 0.05, -halfL),
    new THREE.Vector3(halfW, 0.05, -halfL)
  ];
  const tickGeo = new THREE.BufferGeometry().setFromPoints(points);
  const ticks = new THREE.LineSegments(tickGeo, tickMat);
  group.add(ticks);

  return group;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  consist,
  selectedVehicleIndex,
  onSelectVehicle,
  selectedLibraryVehicle = null,
  installedCatalogue,
  viewportMode: controlledMode,
  onChangeViewportMode
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Internal fallback if parent doesn't control viewportMode; defaults to 'selected_vehicle'
  const [internalMode, setInternalMode] = useState<ViewportDisplayMode>('selected_vehicle');
  const displayMode = controlledMode ?? internalMode;

  const setDisplayMode = useCallback(
    (mode: ViewportDisplayMode) => {
      if (onChangeViewportMode) {
        onChangeViewportMode(mode);
      } else {
        setInternalMode(mode);
      }
    },
    [onChangeViewportMode]
  );

  // References to keep across renders
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const trainGroupRef = useRef<THREE.Group | null>(null);
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const dimensionGroupRef = useRef<THREE.Group | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const vehicleGroupsRef = useRef<THREE.Group[]>([]);
  const renderRequestedRef = useRef(false);

  // Light References for real-time updates
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);

  // Viewport Settings State
  const [showGrid, setShowGrid] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);

  // Floating Lighting Control Panel State
  const [isLightingPanelOpen, setIsLightingPanelOpen] = useState(false);
  const [ambientIntensity, setAmbientIntensity] = useState(0.85);
  const [sunAzimuth, setSunAzimuth] = useState(45); // degrees (0 - 360)
  const [sunElevation, setSunElevation] = useState(55); // degrees (5 - 85)
  const [sunIntensity, setSunIntensity] = useState(1.4); // 0 - 3.0
  const [castShadows, setCastShadows] = useState(true);

  // Determine the active single vehicle when in 'selected_vehicle' or 'selected_consist_unit' mode
  const activeIsolatedInfo = useMemo(() => {
    if (displayMode === 'selected_vehicle') {
      if (selectedLibraryVehicle) {
        return {
          entry: vehicleItemToEntry(selectedLibraryVehicle),
          catalogueItem: selectedLibraryVehicle,
          sourceLabel: 'ROLLING STOCK CATALOGUE',
          unitBadge: `${selectedLibraryVehicle.folder}/${selectedLibraryVehicle.filename}`
        };
      }
      // Fallback to selected consist unit or first consist unit if no library vehicle clicked yet
      const fallbackIdx =
        selectedVehicleIndex !== null && consist.vehicles[selectedVehicleIndex]
          ? selectedVehicleIndex
          : 0;
      const fallbackUnit = consist.vehicles[fallbackIdx];
      if (fallbackUnit) {
        const ext = fallbackUnit.type === 'engine' ? '.eng' : '.wag';
        const base = fallbackUnit.filename.replace(/\.(eng|wag)$/i, '');
        const key = `${fallbackUnit.folder}/${base}${ext}`.toLowerCase();
        const catItem = installedCatalogue?.get(key) || null;
        return {
          entry: fallbackUnit,
          catalogueItem: catItem,
          sourceLabel: 'SELECTED VEHICLE PREVIEW',
          unitBadge: `Unit #${fallbackIdx + 1} · ${fallbackUnit.folder}/${base}${ext}`
        };
      }
      return null;
    }

    if (displayMode === 'selected_consist_unit') {
      const targetIdx =
        selectedVehicleIndex !== null && consist.vehicles[selectedVehicleIndex]
          ? selectedVehicleIndex
          : 0;
      const unit = consist.vehicles[targetIdx];
      if (!unit) return null;
      const ext = unit.type === 'engine' ? '.eng' : '.wag';
      const base = unit.filename.replace(/\.(eng|wag)$/i, '');
      const key = `${unit.folder}/${base}${ext}`.toLowerCase();
      const catItem = installedCatalogue?.get(key) || null;
      return {
        entry: unit,
        catalogueItem: catItem,
        sourceLabel: `CONSIST UNIT #${targetIdx + 1} OF ${consist.vehicles.length}`,
        unitBadge: `${unit.folder}/${base}${ext}`
      };
    }

    return null;
  }, [displayMode, selectedLibraryVehicle, selectedVehicleIndex, consist.vehicles, installedCatalogue]);

  // Trigger on-demand render
  const requestRender = useCallback(() => {
    if (renderRequestedRef.current) return;
    renderRequestedRef.current = true;
    requestAnimationFrame(() => {
      renderRequestedRef.current = false;
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        controlsRef.current?.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    });
  }, []);

  // Frame current scene contents (single vehicle or entire consist)
  const frameActiveScene = useCallback(() => {
    if (!trainGroupRef.current || !controlsRef.current || !cameraRef.current) return;

    const box = new THREE.Box3().setFromObject(trainGroupRef.current);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const camera = cameraRef.current;
    controlsRef.current.target.copy(center);

    if (displayMode !== 'full_consist') {
      // Tight, distortion-free engineering framing for a single vehicle
      const vehLen = Math.max(size.z, size.x, 14);
      const dist = vehLen * 1.15;
      camera.position.set(center.x + dist * 0.85, center.y + vehLen * 0.25, center.z + dist * 0.65);
      camera.lookAt(center);
    } else {
      // Full consist framing
      const maxDim = Math.max(size.x, size.y, size.z, 20);
      if (camera instanceof THREE.PerspectiveCamera) {
        const fov = camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.1;
        cameraDistance = Math.max(cameraDistance, 25);
        camera.position.set(
          center.x + cameraDistance * 0.6,
          center.y + 12,
          center.z + cameraDistance * 0.7
        );
        camera.lookAt(center);
      }
    }

    controlsRef.current.update();
    requestRender();
  }, [displayMode, requestRender]);

  // Frame selected vehicle inside full consist mode
  const frameSelected = useCallback(() => {
    if (displayMode !== 'full_consist') {
      frameActiveScene();
      return;
    }
    if (
      selectedVehicleIndex === null ||
      !vehicleGroupsRef.current[selectedVehicleIndex] ||
      !controlsRef.current ||
      !cameraRef.current
    ) {
      frameActiveScene();
      return;
    }

    const targetGroup = vehicleGroupsRef.current[selectedVehicleIndex];
    const box = new THREE.Box3().setFromObject(targetGroup);
    const center = new THREE.Vector3();
    box.getCenter(center);

    controlsRef.current.target.copy(center);

    if (cameraRef.current instanceof THREE.PerspectiveCamera) {
      cameraRef.current.position.set(center.x + 18, center.y + 5.5, center.z + 16);
    }
    controlsRef.current.update();
    requestRender();
  }, [displayMode, selectedVehicleIndex, frameActiveScene, requestRender]);

  // Camera presets (Side, Front, Rear, Top, Free 3D Perspective)
  const applyCameraPreset = (preset: 'iso' | 'front' | 'rear' | 'side' | 'top') => {
    if (!controlsRef.current || !cameraRef.current || !trainGroupRef.current) return;

    const box = new THREE.Box3().setFromObject(trainGroupRef.current);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getSize(size);
    } else {
      center.copy(controlsRef.current.target);
      size.set(3.2, 4.2, 22);
    }

    controlsRef.current.target.copy(center);
    const camera = cameraRef.current;
    const isSingle = displayMode !== 'full_consist';
    const span = Math.max(size.z, 18);

    if (preset === 'iso') {
      const d = isSingle ? span * 1.1 : Math.max(span * 0.55, 35);
      camera.position.set(center.x + d * 0.85, center.y + (isSingle ? 5.5 : 16), center.z + d * 0.7);
    } else if (preset === 'side') {
      const sideDist = isSingle ? span * 1.25 : Math.max(span * 0.75, 55);
      camera.position.set(center.x + sideDist, center.y + 2.4, center.z);
    } else if (preset === 'front') {
      const frontDist = isSingle ? span * 0.95 : Math.max(span * 0.6, 40);
      camera.position.set(center.x, center.y + 2.5, center.z + frontDist);
    } else if (preset === 'rear') {
      const rearDist = isSingle ? span * 0.95 : Math.max(span * 0.6, 40);
      camera.position.set(center.x, center.y + 2.5, center.z - rearDist);
    } else if (preset === 'top') {
      const topDist = isSingle ? span * 1.4 : Math.max(span * 0.85, 65);
      camera.position.set(center.x, center.y + topDist, center.z + 0.05);
    }

    camera.lookAt(center);
    controlsRef.current.update();
    requestRender();
  };

  // Quick lighting preset applicator
  const applyLightingPreset = (preset: 'studio' | 'noon' | 'sunset' | 'overcast') => {
    if (preset === 'studio') {
      setAmbientIntensity(0.85);
      setSunAzimuth(45);
      setSunElevation(55);
      setSunIntensity(1.4);
      setCastShadows(true);
    } else if (preset === 'noon') {
      setAmbientIntensity(1.1);
      setSunAzimuth(180);
      setSunElevation(82);
      setSunIntensity(1.8);
      setCastShadows(true);
    } else if (preset === 'sunset') {
      setAmbientIntensity(0.55);
      setSunAzimuth(280);
      setSunElevation(16);
      setSunIntensity(1.6);
      setCastShadows(true);
    } else if (preset === 'overcast') {
      setAmbientIntensity(1.5);
      setSunAzimuth(45);
      setSunElevation(50);
      setSunIntensity(0.4);
      setCastShadows(false);
    }
  };

  // 1. Initial Scene Setup (runs once)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // Detect software WebGL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1115);
    scene.fog = new THREE.FogExp2(0x0e1115, 0.0028);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.4, 1400);
    camera.position.set(22, 6, 18);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Environment Reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Ambient / Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x11161d, ambientIntensity);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    // Directional Sun Light
    const dirLight = new THREE.DirectionalLight(0xfff7ed, sunIntensity);
    const radAzimuth = (sunAzimuth * Math.PI) / 180;
    const radElevation = (sunElevation * Math.PI) / 180;
    const dist = 80;
    dirLight.position.set(
      dist * Math.cos(radElevation) * Math.sin(radAzimuth),
      Math.max(5, dist * Math.sin(radElevation)),
      dist * Math.cos(radElevation) * Math.cos(radAzimuth)
    );
    dirLight.castShadow = !isSoftwareGl && castShadows;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0002;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Secondary Fill Light
    const fillLight = new THREE.DirectionalLight(0x79a997, 0.45);
    fillLight.position.set(-30, 20, -30);
    scene.add(fillLight);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 + 0.04;
    controls.minDistance = 3;
    controls.maxDistance = 600;
    controls.addEventListener('change', () => requestRender());
    controlsRef.current = controls;

    // Ground Grid
    const grid = new THREE.GridHelper(300, 150, 0x252d36, 0x181e26);
    grid.position.y = -0.16;
    grid.name = 'viewport_grid';
    scene.add(grid);

    // Train, Track & Dimension Groups
    const trainGroup = new THREE.Group();
    trainGroup.name = 'consist_train_group';
    scene.add(trainGroup);
    trainGroupRef.current = trainGroup;

    const trackGroup = new THREE.Group();
    trackGroup.name = 'consist_track_group';
    scene.add(trackGroup);
    trackGroupRef.current = trackGroup;

    const dimGroup = new THREE.Group();
    dimGroup.name = 'consist_dimension_group';
    scene.add(dimGroup);
    dimensionGroupRef.current = dimGroup;

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
          if (cameraRef.current instanceof THREE.PerspectiveCamera) {
            cameraRef.current.aspect = newW / newH;
            cameraRef.current.updateProjectionMatrix();
          }
          rendererRef.current.setSize(newW, newH);
          requestRender();
        }
      }
    });
    resizeObserver.observe(container);

    // Raycaster for Vehicle Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(trainGroup.children, true);

      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent !== trainGroup) {
          current = current.parent;
        }
        if (current && current.userData && typeof current.userData.index === 'number') {
          onSelectVehicle(current.userData.index);
          return;
        }
      }
    };

    renderer.domElement.addEventListener('click', handleClick);
    requestRender();

    return () => {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.dispose();
      controls.dispose();
    };
  }, [requestRender, onSelectVehicle]);

  // 2. Real-time Lighting & Sun Updates
  useEffect(() => {
    if (hemiLightRef.current) {
      hemiLightRef.current.intensity = ambientIntensity;
    }

    if (dirLightRef.current) {
      dirLightRef.current.intensity = sunIntensity;
      dirLightRef.current.castShadow = castShadows;

      const radAzimuth = (sunAzimuth * Math.PI) / 180;
      const radElevation = (sunElevation * Math.PI) / 180;
      const dist = 80;

      dirLightRef.current.position.set(
        dist * Math.cos(radElevation) * Math.sin(radAzimuth),
        Math.max(5, dist * Math.sin(radElevation)),
        dist * Math.cos(radElevation) * Math.cos(radAzimuth)
      );
    }

    if (trainGroupRef.current) {
      trainGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = castShadows;
        }
      });
    }

    requestRender();
  }, [ambientIntensity, sunAzimuth, sunElevation, sunIntensity, castShadows, requestRender]);

  // Helper: construct a 3D mesh for a vehicle (uses loaded .S + .DDS/.ACE shape if available, else procedural fallback)
  const buildOrLoadVehicleMesh = useCallback(
    (vehEntry: ConsistVehicleEntry, index: number): { mesh: THREE.Group; isRealShape: boolean } => {
      const ext = vehEntry.type === 'engine' ? '.eng' : '.wag';
      const base = vehEntry.filename.replace(/\.(eng|wag)$/i, '');
      const canonicalId = `${vehEntry.folder}/${base}${ext}`.toLowerCase();

      const loadedShape =
        getLoadedShapeGroupForVehicle(canonicalId) ||
        getLoadedShapeGroupForVehicle(vehEntry.vehicleId);

      if (loadedShape) {
        loadedShape.userData = {
          index,
          uid: vehEntry.uid,
          vehicleId: vehEntry.vehicleId,
          name: vehEntry.name,
          isRealMstsShape: true
        };
        if (vehEntry.flipDirection) {
          loadedShape.rotation.y = Math.PI;
        }
        return { mesh: loadedShape, isRealShape: true };
      }

      const fallbackMesh = buildVehicle3D(vehEntry, index);
      return { mesh: fallbackMesh, isRealShape: false };
    },
    []
  );

  // Track whether current rendered model is an authentic .S shape or dimension-locked preview
  const [renderedRealShapeCount, setRenderedRealShapeCount] = useState(0);

  // 3. Rebuild Scene Geometry based on Display Mode (Selected Vehicle, Selected Consist Unit, or Full Consist)
  useEffect(() => {
    if (
      !sceneRef.current ||
      !trainGroupRef.current ||
      !trackGroupRef.current ||
      !dimensionGroupRef.current
    ) {
      return;
    }

    const trainGroup = trainGroupRef.current;
    const trackGroup = trackGroupRef.current;
    const dimGroup = dimensionGroupRef.current;

    while (trainGroup.children.length > 0) {
      trainGroup.remove(trainGroup.children[0]);
    }
    while (trackGroup.children.length > 0) {
      trackGroup.remove(trackGroup.children[0]);
    }
    while (dimGroup.children.length > 0) {
      dimGroup.remove(dimGroup.children[0]);
    }

    vehicleGroupsRef.current = [];
    let realShapesUsed = 0;

    if (displayMode === 'selected_vehicle' || displayMode === 'selected_consist_unit') {
      // ISOLATED SINGLE-VEHICLE MODE (Default TSRE5-inspired behavior)
      if (activeIsolatedInfo) {
        const { entry, catalogueItem } = activeIsolatedInfo;
        const unitIdx =
          displayMode === 'selected_consist_unit' && selectedVehicleIndex !== null
            ? selectedVehicleIndex
            : 0;
        const { mesh: vehicleMesh, isRealShape } = buildOrLoadVehicleMesh(entry, unitIdx);
        if (isRealShape) realShapesUsed++;

        vehicleMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = castShadows;
          }
        });

        vehicleMesh.position.set(0, 0, 0);
        trainGroup.add(vehicleMesh);
        vehicleGroupsRef.current[unitIdx] = vehicleMesh;

        const length = catalogueItem?.lengthMeters || entry.lengthMeters || 22.0;
        const width = catalogueItem?.dimensions?.width || 3.15;
        const height = catalogueItem?.dimensions?.height || 4.15;

        // Add short single-vehicle inspection track (length + 14m margin)
        const trackMesh = buildRailwayTrack(Math.max(length + 14, 34));
        trackGroup.add(trackMesh);

        // Add CAD dimension wireframe callout
        const callout = buildDimensionCalloutBox(width, height, length);
        callout.visible = showDimensions;
        dimGroup.add(callout);
      } else {
        // Empty track if nothing exists
        const trackMesh = buildRailwayTrack(36);
        trackGroup.add(trackMesh);
      }
    } else {
      // FULL CONSIST PREVIEW MODE (Preserves original working consist formation rendering)
      const gap = 0.35;
      let totalLength = 0;
      consist.vehicles.forEach((v) => {
        totalLength += (v.lengthMeters || 22.0) + gap;
      });

      let offsetZ = totalLength / 2;

      consist.vehicles.forEach((veh, idx) => {
        const length = veh.lengthMeters || (veh.type === 'engine' ? 20.5 : 22.0);
        const { mesh: vehicleMesh, isRealShape } = buildOrLoadVehicleMesh(veh, idx);
        if (isRealShape) realShapesUsed++;

        vehicleMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = castShadows;
          }
        });

        const centerZ = offsetZ - length / 2;
        vehicleMesh.position.set(0, 0, centerZ);
        trainGroup.add(vehicleMesh);
        vehicleGroupsRef.current.push(vehicleMesh);

        offsetZ -= length + gap;
      });

      const trackMesh = buildRailwayTrack(Math.max(totalLength, 60));
      trackGroup.add(trackMesh);
    }

    setRenderedRealShapeCount(realShapesUsed);
    frameActiveScene();
    requestRender();
  }, [
    displayMode,
    activeIsolatedInfo,
    consist,
    selectedVehicleIndex,
    buildOrLoadVehicleMesh,
    castShadows,
    showDimensions,
    frameActiveScene,
    requestRender
  ]);

  // 4. Update Selection Highlighting Bounding Box (in Full Consist Mode)
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    if (selectionBoxRef.current) {
      scene.remove(selectionBoxRef.current);
      selectionBoxRef.current.dispose();
      selectionBoxRef.current = null;
    }

    if (
      displayMode === 'full_consist' &&
      selectedVehicleIndex !== null &&
      vehicleGroupsRef.current[selectedVehicleIndex]
    ) {
      const target = vehicleGroupsRef.current[selectedVehicleIndex];
      const box = new THREE.BoxHelper(target, new THREE.Color(0x79a997));
      box.name = 'selection_highlight_box';
      scene.add(box);
      selectionBoxRef.current = box;
    }

    requestRender();
  }, [displayMode, selectedVehicleIndex, requestRender]);

  // 5. Toggle Grid Visibility
  useEffect(() => {
    if (!sceneRef.current) return;
    const grid = sceneRef.current.getObjectByName('viewport_grid');
    if (grid) {
      grid.visible = showGrid;
      requestRender();
    }
  }, [showGrid, requestRender]);

  // 6. Toggle Dimension Callout Visibility
  useEffect(() => {
    if (dimensionGroupRef.current) {
      dimensionGroupRef.current.children.forEach((c) => {
        c.visible = showDimensions;
      });
      requestRender();
    }
  }, [showDimensions, requestRender]);

  // Compute active vehicle dimensions & asset diagnostic status for HUD
  const isolatedSpecs = useMemo(() => {
    if (!activeIsolatedInfo) return null;
    const { entry, catalogueItem } = activeIsolatedInfo;
    const length = catalogueItem?.lengthMeters || entry.lengthMeters || 22.0;
    const width = catalogueItem?.dimensions?.width || 3.15;
    const height = catalogueItem?.dimensions?.height || 4.15;
    const mass = catalogueItem?.massTons || entry.massTons || 50;
    const diag = catalogueItem?.assetDiagnostics;
    const ddsCount =
      diag?.textureStatuses.filter((t) => t.containerType === 'DDS').length || 0;
    const aceCount =
      diag?.textureStatuses.filter((t) => t.containerType === 'ACE').length || 0;

    return {
      name: catalogueItem?.name || entry.name,
      length,
      width,
      height,
      mass,
      shapeFile: catalogueItem?.wagonShape,
      diag,
      ddsCount,
      aceCount
    };
  }, [activeIsolatedInfo]);

  return (
    <div className="relative w-full h-full min-h-[360px] bg-[#0E1115] overflow-hidden select-none">
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left: 3-Mode Viewport Switcher & Active Vehicle Telemetry */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 max-w-[56%]">
        {/* Mode Switcher Bar */}
        <div className="inline-flex items-center bg-[#14191F]/95 backdrop-blur-sm border border-[#252D36] p-0.5 rounded shadow-md">
          <button
            onClick={() => setDisplayMode('selected_vehicle')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              displayMode === 'selected_vehicle'
                ? 'bg-[#79A997]/20 text-[#79A997] border border-[#79A997]/40'
                : 'text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028]'
            }`}
            title="Inspect a single selected rolling-stock vehicle (Default)"
          >
            <Box className="w-3 h-3" />
            <span>1. Selected Vehicle</span>
          </button>

          <button
            onClick={() => setDisplayMode('selected_consist_unit')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              displayMode === 'selected_consist_unit'
                ? 'bg-[#79A997]/20 text-[#79A997] border border-[#79A997]/40'
                : 'text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028]'
            }`}
            title="Isolate only the currently clicked unit in the active consist"
          >
            <Layers className="w-3 h-3" />
            <span>2. Selected Consist Unit</span>
          </button>

          <button
            onClick={() => setDisplayMode('full_consist')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              displayMode === 'full_consist'
                ? 'bg-[#79A997]/20 text-[#79A997] border border-[#79A997]/40'
                : 'text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028]'
            }`}
            title="Render the entire multi-vehicle consist formation"
          >
            <Train className="w-3 h-3" />
            <span>3. Full Consist ({consist.vehicles.length})</span>
          </button>
        </div>

        {/* Telemetry Readout Pill */}
        {displayMode !== 'full_consist' && activeIsolatedInfo && isolatedSpecs ? (
          <div className="bg-[#14191F]/90 backdrop-blur-sm border border-[#252D36] px-3 py-1.5 rounded text-xs text-[#E8EDF2] flex flex-wrap items-center gap-x-2.5 gap-y-1 pointer-events-none">
            <span className="font-semibold text-[#E8EDF2] truncate max-w-[240px]">
              {isolatedSpecs.name}
            </span>
            <span className="text-[#65717E]">·</span>
            <span className="font-mono text-[11px] text-[#79A997]">
              {activeIsolatedInfo.unitBadge}
            </span>
            <span className="text-[#65717E]">·</span>
            <span className="font-mono tabular-nums text-[11px] text-[#929DA9]">
              L {isolatedSpecs.length.toFixed(2)}m × W {isolatedSpecs.width.toFixed(2)}m × H{' '}
              {isolatedSpecs.height.toFixed(2)}m · {isolatedSpecs.mass}t
            </span>
          </div>
        ) : (
          <div className="bg-[#14191F]/90 backdrop-blur-sm border border-[#252D36] px-3 py-1.5 rounded text-xs text-[#E8EDF2] flex items-center gap-2 pointer-events-none">
            <span className="font-semibold text-[#79A997]">FULL CONSIST FORMATION</span>
            <span className="text-[#65717E]">·</span>
            <span className="font-mono tabular-nums text-[#929DA9]">
              {consist.vehicles.length} UNITS
            </span>
            <span className="text-[#65717E]">·</span>
            <span className="font-mono tabular-nums text-[#929DA9]">
              {Math.round(consist.vehicles.reduce((sum, v) => sum + (v.lengthMeters || 22), 0))}m
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Viewport Camera Presets & Utilities */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-[#14191F]/95 backdrop-blur-sm border border-[#252D36] p-1 rounded shadow-md z-10">
        <button
          onClick={() => applyCameraPreset('side')}
          title="Side Elevation View"
          className="px-2 py-1 text-[11px] font-medium text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028] rounded transition-colors"
        >
          Side
        </button>
        <button
          onClick={() => applyCameraPreset('front')}
          title="Front Coupler / Cab View"
          className="px-2 py-1 text-[11px] font-medium text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028] rounded transition-colors"
        >
          Front
        </button>
        <button
          onClick={() => applyCameraPreset('rear')}
          title="Rear Coupler View"
          className="px-2 py-1 text-[11px] font-medium text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028] rounded transition-colors"
        >
          Rear
        </button>
        <button
          onClick={() => applyCameraPreset('top')}
          title="Top Plan View"
          className="px-2 py-1 text-[11px] font-medium text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028] rounded transition-colors"
        >
          Top
        </button>
        <button
          onClick={() => applyCameraPreset('iso')}
          title="Free 3D Perspective View"
          className="px-2 py-1 text-[11px] font-medium text-[#929DA9] hover:text-[#E8EDF2] hover:bg-[#1A2028] rounded transition-colors"
        >
          3D Persp
        </button>

        <div className="w-[1px] h-4 bg-[#252D36] mx-0.5" />

        <button
          onClick={frameActiveScene}
          title={displayMode === 'full_consist' ? 'Frame Entire Consist' : 'Fit Selected Vehicle'}
          className="p-1.5 text-[#929DA9] hover:text-[#79A997] hover:bg-[#1A2028] rounded transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {displayMode === 'full_consist' && (
          <button
            onClick={frameSelected}
            disabled={selectedVehicleIndex === null}
            title="Focus Selected Consist Unit"
            className={`p-1.5 rounded transition-colors ${
              selectedVehicleIndex !== null
                ? 'text-[#929DA9] hover:text-[#79A997] hover:bg-[#1A2028]'
                : 'text-[#65717E]/40 cursor-not-allowed'
            }`}
          >
            <Focus className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setShowDimensions(!showDimensions)}
          title="Toggle 3D Dimension Callout Wireframe"
          className={`p-1.5 rounded transition-colors ${
            showDimensions ? 'text-[#79A997] bg-[#1A2028]' : 'text-[#929DA9] hover:text-[#E8EDF2]'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Floor Grid"
          className={`p-1.5 rounded transition-colors ${
            showGrid ? 'text-[#79A997] bg-[#1A2028]' : 'text-[#929DA9] hover:text-[#E8EDF2]'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-4 bg-[#252D36] mx-0.5" />

        {/* Lighting Panel Toggle Button */}
        <button
          onClick={() => setIsLightingPanelOpen(!isLightingPanelOpen)}
          title="Lighting & Sun Direction Controls"
          className={`p-1.5 rounded transition-colors flex items-center gap-1 ${
            isLightingPanelOpen
              ? 'text-[#79A997] bg-[#1A2028]'
              : 'text-[#929DA9] hover:text-[#79A997] hover:bg-[#1A2028]'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Lighting & Sun Direction Control Panel */}
      {isLightingPanelOpen && (
        <div className="absolute top-12 right-3 z-30 w-72 bg-[#14191F]/95 backdrop-blur-md border border-[#252D36] rounded-lg shadow-2xl p-3.5 space-y-3 select-none text-xs text-[#E8EDF2]">
          <div className="flex items-center justify-between border-b border-[#252D36] pb-2">
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-[#79A997]" />
              <span className="font-semibold text-xs tracking-wider uppercase text-[#E8EDF2]">
                Lighting & Sun Controls
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => applyLightingPreset('studio')}
                title="Reset to Studio Default"
                className="p-1 text-[#65717E] hover:text-[#79A997] rounded transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsLightingPanelOpen(false)}
                className="p-1 text-[#65717E] hover:text-[#E8EDF2] rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Ambient Light Intensity Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#929DA9]">Ambient Light Intensity</span>
              <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                {ambientIntensity.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2.5"
              step="0.05"
              value={ambientIntensity}
              onChange={(e) => setAmbientIntensity(parseFloat(e.target.value))}
              className="w-full accent-[#79A997] bg-[#0E1115] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Sun Azimuth (Heading) Slider */}
          <div className="space-y-1.5 pt-1 border-t border-[#252D36]/60">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#929DA9]">Sun Azimuth (Direction)</span>
              <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                {sunAzimuth}° ({getCompassHeading(sunAzimuth)})
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={sunAzimuth}
              onChange={(e) => setSunAzimuth(parseInt(e.target.value, 10))}
              className="w-full accent-[#79A997] bg-[#0E1115] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Sun Elevation (Altitude) Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#929DA9]">Sun Elevation (Altitude)</span>
              <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                {sunElevation}°
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="85"
              step="1"
              value={sunElevation}
              onChange={(e) => setSunElevation(parseInt(e.target.value, 10))}
              className="w-full accent-[#79A997] bg-[#0E1115] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Sun Beam Intensity */}
          <div className="space-y-1.5 pt-1 border-t border-[#252D36]/60">
            <div className="flex justify-between text-[11px]">
              <span className="text-[#929DA9]">Sun Beam Intensity</span>
              <span className="font-mono tabular-nums text-[#79A997] font-semibold">
                {sunIntensity.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="3.0"
              step="0.1"
              value={sunIntensity}
              onChange={(e) => setSunIntensity(parseFloat(e.target.value))}
              className="w-full accent-[#79A997] bg-[#0E1115] h-1.5 rounded cursor-pointer"
            />
          </div>

          {/* Toggle Shadow Casting */}
          <div className="flex items-center justify-between pt-1 border-t border-[#252D36]/60">
            <span className="text-[11px] text-[#929DA9]">Cast 3D Model Shadows</span>
            <button
              onClick={() => setCastShadows(!castShadows)}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                castShadows ? 'bg-[#79A997]' : 'bg-[#252D36]'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  castShadows ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Quick Lighting Presets */}
          <div className="pt-2 border-t border-[#252D36]/60 space-y-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#65717E] block">
              Lighting Presets
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => applyLightingPreset('studio')}
                className="px-2 py-1 bg-[#1A2028] hover:bg-[#252D36] text-[11px] text-[#E8EDF2] rounded border border-[#252D36] transition-colors"
              >
                Studio Default
              </button>
              <button
                onClick={() => applyLightingPreset('noon')}
                className="px-2 py-1 bg-[#1A2028] hover:bg-[#252D36] text-[11px] text-[#E8EDF2] rounded border border-[#252D36] transition-colors"
              >
                High Noon
              </button>
              <button
                onClick={() => applyLightingPreset('sunset')}
                className="px-2 py-1 bg-[#1A2028] hover:bg-[#252D36] text-[11px] text-[#E8EDF2] rounded border border-[#252D36] transition-colors"
              >
                Golden Hour
              </button>
              <button
                onClick={() => applyLightingPreset('overcast')}
                className="px-2 py-1 bg-[#1A2028] hover:bg-[#252D36] text-[11px] text-[#E8EDF2] rounded border border-[#252D36] transition-colors"
              >
                Soft Overcast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Left & Right Status Bar: Render Representation & Controls Hint */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] pointer-events-none">
        <div className="flex items-center gap-1.5 text-[#65717E]">
          <span>Left-drag: Orbit</span>
          <span>·</span>
          <span>Right-drag: Pan</span>
          <span>·</span>
          <span>Scroll: Zoom</span>
        </div>

        {/* Transparent Render Mode Diagnostic Badge */}
        <div className="bg-[#14191F]/90 border border-[#252D36] px-2.5 py-0.5 rounded flex items-center gap-2">
          {renderedRealShapeCount > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#69BD91]" />
              <span className="font-mono text-[10px] text-[#69BD91]">
                AUTHENTIC MSTS .S + .DDS/.ACE GEOMETRY ({renderedRealShapeCount} MESH)
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#D6A85B]" />
              <span className="font-mono text-[10px] text-[#929DA9]">
                DIMENSION-LOCKED ENGINEERING PREVIEW
                {isolatedSpecs?.diag
                  ? ` (${isolatedSpecs.diag.shapeFilename || 'No .S'} · ${isolatedSpecs.diag.renderMode})`
                  : ' (Scan TRAINSET for .S + .DDS/.ACE)'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
