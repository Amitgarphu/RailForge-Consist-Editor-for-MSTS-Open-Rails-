/**
 * RailForge Consist - 3D Procedural Trainset Geometry Generator
 * @license Apache-2.0
 * 
 * Assembles composite 8-12 part procedural rolling stock models (Three.js Group)
 * with authentic proportions, bogies, wheelsets, pantographs, couplers and liveries.
 */

import * as THREE from 'three';
import { ConsistVehicleEntry } from '../../types/msts';

// Shared reusable materials to optimize memory & draw calls
const MAT_TRACK_RAIL = new THREE.MeshStandardMaterial({
  color: 0x8a9299,
  metalness: 0.85,
  roughness: 0.25
});

const MAT_TRACK_SLEEPER = new THREE.MeshStandardMaterial({
  color: 0x2d3238,
  roughness: 0.9,
  metalness: 0.1
});

const MAT_BALLAST = new THREE.MeshStandardMaterial({
  color: 0x14181c,
  roughness: 0.95,
  metalness: 0.05
});

const MAT_WHEEL = new THREE.MeshStandardMaterial({
  color: 0x22262a,
  metalness: 0.9,
  roughness: 0.3
});

const MAT_BOGIE_FRAME = new THREE.MeshStandardMaterial({
  color: 0x181c20,
  metalness: 0.6,
  roughness: 0.6
});

const MAT_PANTOGRAPH = new THREE.MeshStandardMaterial({
  color: 0x8e3b3b,
  metalness: 0.7,
  roughness: 0.4
});

const MAT_COUPLER = new THREE.MeshStandardMaterial({
  color: 0x2a2f35,
  metalness: 0.8,
  roughness: 0.5
});

const MAT_WINDOW_GLASS = new THREE.MeshStandardMaterial({
  color: 0x1e2a38,
  metalness: 0.9,
  roughness: 0.15
});

/**
 * Build a 2-axle railway bogie (truck) with 4 wheels, axles, and side frames
 */
function createBogieMesh(): THREE.Group {
  const bogie = new THREE.Group();

  // Main frame
  const frameGeo = new THREE.BoxGeometry(2.4, 0.25, 2.8);
  const frameMesh = new THREE.Mesh(frameGeo, MAT_BOGIE_FRAME);
  frameMesh.position.y = 0.5;
  bogie.add(frameMesh);

  // Wheel geometry (cylinder)
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.16, 24);
  wheelGeo.rotateZ(Math.PI / 2);

  const axleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12);
  axleGeo.rotateZ(Math.PI / 2);

  const axleOffsets = [-0.95, 0.95];
  const wheelOffsetsZ = [-1.05, 1.05];

  for (const z of axleOffsets) {
    // Axle
    const axle = new THREE.Mesh(axleGeo, MAT_WHEEL);
    axle.position.set(0, 0.48, z);
    bogie.add(axle);

    // Left and Right Wheels
    for (const x of [-0.95, 0.95]) {
      const wheel = new THREE.Mesh(wheelGeo, MAT_WHEEL);
      wheel.position.set(x, 0.48, z);
      bogie.add(wheel);
    }
  }

  // Springs / suspension blocks
  const springGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.35, 12);
  for (const x of [-1.15, 1.15]) {
    const spring = new THREE.Mesh(springGeo, MAT_BOGIE_FRAME);
    spring.position.set(x, 0.65, 0);
    bogie.add(spring);
  }

  return bogie;
}

/**
 * Build a pantograph assembly for electric traction
 */
function createPantograph(): THREE.Group {
  const panto = new THREE.Group();

  // Base frame
  const baseGeo = new THREE.BoxGeometry(1.6, 0.1, 1.8);
  const base = new THREE.Mesh(baseGeo, MAT_BOGIE_FRAME);
  panto.add(base);

  // Lower arm (angled cylinder)
  const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8);
  const lowerArm = new THREE.Mesh(armGeo, MAT_PANTOGRAPH);
  lowerArm.position.set(0, 0.55, -0.4);
  lowerArm.rotation.x = Math.PI / 4;
  panto.add(lowerArm);

  // Upper arm
  const upperArm = new THREE.Mesh(armGeo, MAT_PANTOGRAPH);
  upperArm.position.set(0, 1.25, 0.2);
  upperArm.rotation.x = -Math.PI / 4;
  panto.add(upperArm);

  // Contact shoe (collector pan)
  const panGeo = new THREE.BoxGeometry(1.8, 0.05, 0.3);
  const pan = new THREE.Mesh(panGeo, MAT_TRACK_RAIL);
  pan.position.set(0, 1.7, 0.4);
  panto.add(pan);

  return panto;
}

/**
 * Determine livery materials based on vehicle classification
 */
function getLiveryMaterials(veh: ConsistVehicleEntry): {
  body: THREE.MeshStandardMaterial;
  stripe?: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
} {
  const cat = veh.category;
  const sub = (veh.subCategory || '').toLowerCase();
  const name = (veh.name || '').toLowerCase();

  // 1. Locomotives
  if (veh.type === 'engine') {
    if (sub.includes('wap-7') || name.includes('wap7')) {
      // WAP-7: Crisp White with dark gray chassis and crimson red stripe
      return {
        body: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.35, metalness: 0.2 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xba2424, roughness: 0.4 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x485058, roughness: 0.6 })
      };
    }
    if (sub.includes('wap-4') || name.includes('wap4')) {
      // WAP-4: Classic Indian Railways Maroon/Red
      return {
        body: new THREE.MeshStandardMaterial({ color: 0x8a2323, roughness: 0.4, metalness: 0.2 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xe6c875, roughness: 0.5 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x3d4248, roughness: 0.7 })
      };
    }
    if (sub.includes('wdp-4') || sub.includes('wdg-4') || name.includes('wdp')) {
      // WDP-4/WDG-4: Sky Blue & Light Cream
      return {
        body: new THREE.MeshStandardMaterial({ color: 0x246294, roughness: 0.35, metalness: 0.2 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xe8dbb5, roughness: 0.4 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x333b44, roughness: 0.6 })
      };
    }
    if (sub.includes('wag-9') || name.includes('wag9')) {
      // WAG-9: Dark Freight Green
      return {
        body: new THREE.MeshStandardMaterial({ color: 0x1f4732, roughness: 0.4, metalness: 0.2 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.4 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x2c333a, roughness: 0.7 })
      };
    }
    // Generic Engine
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x364858, roughness: 0.4, metalness: 0.3 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0x79a997, roughness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x232930, roughness: 0.6 })
    };
  }

  // 2. LHB Coaches
  if (cat === 'passenger_lhb' || sub.includes('lhb')) {
    if (sub.includes('humsafar') || name.includes('humsafar')) {
      // Humsafar Teal/Blue
      return {
        body: new THREE.MeshStandardMaterial({ color: 0x1e6a7d, roughness: 0.35, metalness: 0.25 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xe08f38, roughness: 0.4 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x727b84, roughness: 0.5 })
      };
    }
    // Standard LHB Red & Silver Stainless Steel
    return {
      body: new THREE.MeshStandardMaterial({ color: 0xb53131, roughness: 0.35, metalness: 0.3 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xd6dbe0, roughness: 0.25, metalness: 0.6 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x8a9299, roughness: 0.4, metalness: 0.5 })
    };
  }

  // 3. ICF Coaches
  if (cat === 'passenger_icf' || sub.includes('icf')) {
    // Classic Blue & Cream Window band
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x214b78, roughness: 0.4, metalness: 0.2 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xd8c89d, roughness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x48525c, roughness: 0.7 })
    };
  }

  // 4. Freight Wagons
  if (cat === 'freight_wagon' || sub.includes('boxn') || sub.includes('freight')) {
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x5a3d31, roughness: 0.85, metalness: 0.2 }), // Rust brown
      roof: new THREE.MeshStandardMaterial({ color: 0x3d2b24, roughness: 0.9 })
    };
  }

  // 5. Brake Van / EOG / Guard
  if (cat === 'brake_van' || sub.includes('eog') || sub.includes('slr')) {
    if (sub.includes('lhb')) {
      return {
        body: new THREE.MeshStandardMaterial({ color: 0xb53131, roughness: 0.35, metalness: 0.3 }),
        stripe: new THREE.MeshStandardMaterial({ color: 0xd6dbe0, roughness: 0.3, metalness: 0.5 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x8a9299, roughness: 0.4 })
      };
    }
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x2a445e, roughness: 0.45 }),
      stripe: new THREE.MeshStandardMaterial({ color: 0xd8c89d, roughness: 0.4 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x3d4650, roughness: 0.7 })
    };
  }

  // Fallback
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x3e4752, roughness: 0.5 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x282f37, roughness: 0.7 })
  };
}

/**
 * Build a complete, highly detailed 3D vehicle model
 */
export function buildVehicle3D(
  veh: ConsistVehicleEntry,
  index: number
): THREE.Group {
  const root = new THREE.Group();
  root.name = `vehicle_${index}_${veh.filename}`;
  // Store reference to entry on userData for raycasting
  root.userData = {
    index,
    vehicleEntry: veh,
    isTrainVehicle: true
  };

  const isEngine = veh.type === 'engine';
  const isFreight = veh.category === 'freight_wagon';
  const isElectric = isEngine && (veh.subCategory.includes('WAP') || veh.subCategory.includes('WAG') || veh.subCategory.includes('Electric'));

  // Length, width, height (scaled appropriately for 3D view)
  const length = Math.max(12, Math.min(24, veh.lengthMeters || (isEngine ? 20.5 : 22.0)));
  const width = 3.1;
  const height = isFreight ? 2.4 : 3.8;
  const livery = getLiveryMaterials(veh);

  // 1. CHASSIS / UNDERFRAME
  const chassisGeo = new THREE.BoxGeometry(width - 0.2, 0.4, length);
  const chassisMesh = new THREE.Mesh(chassisGeo, MAT_BOGIE_FRAME);
  chassisMesh.position.y = 1.0;
  root.add(chassisMesh);

  // 2. BOGIES (TRUCKS)
  const bogieOffsetZ = (length / 2) * 0.68;
  const frontBogie = createBogieMesh();
  frontBogie.position.set(0, 0, bogieOffsetZ);
  root.add(frontBogie);

  const rearBogie = createBogieMesh();
  rearBogie.position.set(0, 0, -bogieOffsetZ);
  root.add(rearBogie);

  // 3. MAIN BODY SHELL
  if (isFreight) {
    // Open gondola or closed box
    const gondolaGeo = new THREE.BoxGeometry(width, height, length - 0.4);
    const gondola = new THREE.Mesh(gondolaGeo, livery.body);
    gondola.position.y = 1.2 + height / 2;
    root.add(gondola);
  } else {
    // Passenger / Locomotive Hull
    const bodyHeight = height - 0.6;
    const bodyGeo = new THREE.BoxGeometry(width, bodyHeight, length - 0.4);
    const body = new THREE.Mesh(bodyGeo, livery.body);
    body.position.y = 1.2 + bodyHeight / 2;
    root.add(body);

    // Livery window stripe / band
    if (livery.stripe) {
      const stripeGeo = new THREE.BoxGeometry(width + 0.04, 0.9, length - 0.35);
      const stripe = new THREE.Mesh(stripeGeo, livery.stripe);
      stripe.position.y = 2.4;
      root.add(stripe);
    }

    // Window insets along sides
    const windowGeo = new THREE.BoxGeometry(width + 0.08, 0.55, length * 0.78);
    const windows = new THREE.Mesh(windowGeo, MAT_WINDOW_GLASS);
    windows.position.y = 2.4;
    root.add(windows);

    // Curved/Angled Roof
    const roofGeo = new THREE.CylinderGeometry(width / 2, width / 2, length - 0.4, 16, 1, false, 0, Math.PI);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, livery.roof);
    roof.position.y = 1.2 + bodyHeight;
    root.add(roof);

    // Roof AC pods on passenger coaches
    if (veh.category === 'passenger_lhb' || veh.category === 'passenger_icf') {
      const acGeo = new THREE.BoxGeometry(2.0, 0.35, 3.2);
      for (const zOffset of [-length * 0.28, length * 0.28]) {
        const acPod = new THREE.Mesh(acGeo, MAT_BOGIE_FRAME);
        acPod.position.set(0, 1.2 + bodyHeight + 0.2, zOffset);
        root.add(acPod);
      }
    }
  }

  // 4. LOCOMOTIVE SPECIFICS (Cabs, Headlights, Pantographs)
  if (isEngine) {
    // Electric Pantographs
    if (isElectric) {
      const frontPanto = createPantograph();
      frontPanto.position.set(0, 4.4, bogieOffsetZ * 0.85);
      root.add(frontPanto);

      const rearPanto = createPantograph();
      rearPanto.position.set(0, 4.4, -bogieOffsetZ * 0.85);
      rearPanto.rotation.y = Math.PI;
      root.add(rearPanto);
    }

    // Twin Headlight cluster at lead end
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lampGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12);
    lampGeo.rotateX(Math.PI / 2);

    const headlampLeft = new THREE.Mesh(lampGeo, lampMat);
    headlampLeft.position.set(-0.55, 3.2, length / 2 - 0.1);
    root.add(headlampLeft);

    const headlampRight = new THREE.Mesh(lampGeo, lampMat);
    headlampRight.position.set(0.55, 3.2, length / 2 - 0.1);
    root.add(headlampRight);
  }

  // 5. COUPLERS (CBC Knuckles) at front and rear
  const couplerGeo = new THREE.BoxGeometry(0.4, 0.3, 0.8);
  const frontCoupler = new THREE.Mesh(couplerGeo, MAT_COUPLER);
  frontCoupler.position.set(0, 0.9, length / 2 + 0.3);
  root.add(frontCoupler);

  const rearCoupler = new THREE.Mesh(couplerGeo, MAT_COUPLER);
  rearCoupler.position.set(0, 0.9, -(length / 2 + 0.3));
  root.add(rearCoupler);

  // If flipped, rotate 180 degrees
  if (veh.flipDirection) {
    root.rotation.y = Math.PI;
  }

  // Configure shadow casting and receiving for all component meshes
  root.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return root;
}

/**
 * Generate railway track sleepers and rails
 */
export function buildRailwayTrack(length: number): THREE.Group {
  const track = new THREE.Group();
  track.name = 'railway_track';

  // Ballast bed
  const ballastGeo = new THREE.BoxGeometry(5.4, 0.3, length + 20);
  const ballast = new THREE.Mesh(ballastGeo, MAT_BALLAST);
  ballast.position.set(0, -0.15, 0);
  ballast.receiveShadow = true;
  track.add(ballast);

  // Steel Rails (Standard broad gauge / standard gauge distance ~1.676m)
  const railGeo = new THREE.BoxGeometry(0.12, 0.2, length + 20);
  const leftRail = new THREE.Mesh(railGeo, MAT_TRACK_RAIL);
  leftRail.position.set(-0.838, 0.1, 0);
  leftRail.receiveShadow = true;
  leftRail.castShadow = true;
  track.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo, MAT_TRACK_RAIL);
  rightRail.position.set(0.838, 0.1, 0);
  rightRail.receiveShadow = true;
  rightRail.castShadow = true;
  track.add(rightRail);

  // Concrete Sleepers every 0.65m
  const sleeperSpacing = 0.65;
  const count = Math.ceil((length + 20) / sleeperSpacing);
  const sleeperGeo = new THREE.BoxGeometry(3.0, 0.18, 0.32);
  const sleeperInstanced = new THREE.InstancedMesh(sleeperGeo, MAT_TRACK_SLEEPER, count);
  sleeperInstanced.receiveShadow = true;
  sleeperInstanced.castShadow = true;

  const matrix = new THREE.Matrix4();
  const startZ = -(length + 20) / 2;

  for (let i = 0; i < count; i++) {
    const z = startZ + i * sleeperSpacing;
    matrix.setPosition(0, 0.04, z);
    sleeperInstanced.setMatrixAt(i, matrix);
  }
  sleeperInstanced.instanceMatrix.needsUpdate = true;
  track.add(sleeperInstanced);

  return track;
}
