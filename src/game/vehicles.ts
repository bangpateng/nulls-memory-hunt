// Cars: shaped bodies extruded from a side profile, glass cabin, wheels that spin and steer,
// head and tail lights. Used for traffic, parked cars and the car the player drives.
import * as THREE from "three";
import { bake, vcMaterial } from "./bake";

export type CarKind = "sedan" | "taxi" | "hatch" | "van" | "pickup";
const KINDS: CarKind[] = ["sedan", "sedan", "taxi", "hatch", "van", "pickup", "sedan", "hatch"];
const PAINTS = [0x8c1c1c, 0x1c3f7a, 0xd9d6cf, 0x2b2b2e, 0x4d5a3a, 0x6b6f75, 0x7a5a2a, 0x123c3c, 0xa8a49c, 0x5a1f3d];

export interface CarModel {
  root: THREE.Group;
  kind: CarKind;
  length: number;
  width: number;
  wheels: THREE.Object3D[]; // [frontL, frontR, rearL, rearR]
  steer: THREE.Object3D[]; // front wheel pivots
  setLights(night: number, brake: boolean): void;
}

const tireMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb5b8bd, metalness: 0.9, roughness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 1, roughness: 0.2 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d6 });
const signMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0 });
const checkMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: 0.6, roughness: 0.08, envMapIntensity: 1.5 });
const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.25, 12).rotateZ(Math.PI / 2);

function extrude(points: [number, number][], width: number, mat: THREE.Material, bevel = 0.04): THREE.Mesh {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2); // shape x -> car z (forward), extrusion -> car x
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// side profiles: [z forward, y up]
const PROFILES: Record<CarKind, { body: [number, number][]; cabin: [number, number][]; len: number; wb: number; w: number }> = {
  sedan: {
    len: 4.6,
    wb: 1.42,
    w: 1.82,
    body: [
      [-2.3, 0.32],
      [2.3, 0.32],
      [2.36, 0.62],
      [2.2, 0.86],
      [0.95, 0.98],
      [-1.55, 0.98],
      [-2.28, 0.92],
      [-2.36, 0.6],
    ],
    cabin: [
      [0.9, 0.97],
      [0.15, 1.42],
      [-0.95, 1.43],
      [-1.6, 0.97],
    ],
  },
  taxi: {
    len: 4.6,
    wb: 1.42,
    w: 1.82,
    body: [
      [-2.3, 0.32],
      [2.3, 0.32],
      [2.36, 0.62],
      [2.2, 0.86],
      [0.95, 0.98],
      [-1.55, 0.98],
      [-2.28, 0.92],
      [-2.36, 0.6],
    ],
    cabin: [
      [0.9, 0.97],
      [0.15, 1.42],
      [-0.95, 1.43],
      [-1.6, 0.97],
    ],
  },
  hatch: {
    len: 3.9,
    wb: 1.2,
    w: 1.72,
    body: [
      [-1.95, 0.32],
      [1.95, 0.32],
      [2.0, 0.6],
      [1.85, 0.84],
      [0.85, 0.98],
      [-1.9, 1.0],
      [-2.0, 0.6],
    ],
    cabin: [
      [0.82, 0.97],
      [0.1, 1.45],
      [-1.6, 1.47],
      [-1.95, 0.99],
    ],
  },
  van: {
    len: 5,
    wb: 1.65,
    w: 1.95,
    body: [
      [-2.5, 0.34],
      [2.5, 0.34],
      [2.56, 0.7],
      [2.3, 1.05],
      [-2.5, 1.12],
      [-2.56, 0.6],
    ],
    cabin: [
      [2.28, 1.05],
      [1.5, 1.95],
      [-2.48, 2.0],
      [-2.5, 1.1],
    ],
  },
  pickup: {
    len: 5,
    wb: 1.6,
    w: 1.9,
    body: [
      [-2.5, 0.38],
      [2.5, 0.38],
      [2.56, 0.72],
      [2.35, 1.0],
      [0.9, 1.08],
      [-2.5, 1.08],
      [-2.56, 0.65],
    ],
    cabin: [
      [0.88, 1.07],
      [0.3, 1.62],
      [-0.75, 1.63],
      [-0.9, 1.07],
    ],
  },
};

export function buildCar(i: number, kindOverride?: CarKind): CarModel {
  const kind = kindOverride ?? KINDS[i % KINDS.length];
  const P = PROFILES[kind];
  const paint = new THREE.MeshStandardMaterial({ color: kind === "taxi" ? 0xe8b417 : PAINTS[(i * 7) % PAINTS.length], metalness: 0.55, roughness: 0.32, envMapIntensity: 1.2 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(extrude(P.body, P.w, paint));
  // glass cabin and a painted roof cap
  const cabin = extrude(P.cabin, P.w - 0.16, glassMat, 0.03);
  body.add(cabin);
  const top = P.cabin.reduce((a, b) => (b[1] > a ? b[1] : a), 0);
  const roofPts = P.cabin.filter((p) => p[1] > top - 0.05).map((p) => p[0]);
  const roofLen = Math.abs(roofPts[0] - roofPts[roofPts.length - 1]) + 0.15;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.2, 0.07, roofLen), paint);
  roof.position.set(0, top + 0.02, (roofPts[0] + roofPts[roofPts.length - 1]) / 2);
  roof.castShadow = true;
  body.add(roof);
  // pillars between the windows
  const bPillar = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.12, top - 1, 0.1), trimMat);
  bPillar.position.set(0, (top + 1) / 2 + 0.0, (roofPts[0] + roofPts[roofPts.length - 1]) / 2 - 0.1);
  body.add(bPillar);
  if (kind === "taxi") {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), signMat);
    sign.position.set(0, top + 0.17, roof.position.z);
    body.add(sign);
    const chk = new THREE.Mesh(new THREE.BoxGeometry(P.w + 0.01, 0.12, 2.2), checkMat);
    chk.position.set(0, 0.78, -0.3);
    body.add(chk);
  }
  if (kind === "pickup") {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.3, 0.06, 1.5), trimMat);
    bed.position.set(0, 1.09, -1.6);
    body.add(bed);
  }
  // bumpers, grille, mirrors, plates
  const half = P.len / 2;
  for (const s of [1, -1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(P.w + 0.04, 0.2, 0.18), trimMat);
    b.position.set(0, 0.42, s * (half + 0.04));
    body.add(b);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.02), plateMat);
    plate.position.set(0, 0.45, s * (half + 0.14));
    body.add(plate);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(P.w * 0.5, 0.16, 0.05), chromeMat);
  grille.position.set(0, 0.66, half + 0.02);
  body.add(grille);
  for (const s of [-1, 1]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), paint);
    const front = P.cabin[0];
    mir.position.set(s * (P.w / 2 + 0.08), front[1] + 0.08, front[0] - 0.15);
    body.add(mir);
  }
  // lights
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.3 });
  const frontY = P.body[2][1] + 0.02;
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.06), headMat);
    h.position.set(s * (P.w / 2 - 0.3), frontY, half + 0.02);
    body.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.06), tailMat);
    t.position.set(s * (P.w / 2 - 0.28), P.body[P.body.length - 1][1] + 0.12, -half - 0.02);
    body.add(t);
  }
  // headlight cone on the road (visible at night)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CircleGeometry(3.4, 16, -Math.PI / 4 + Math.PI / 2, Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.05, half);
  beam.scale.set(0.8, 2.2, 1);
  root.add(beam);
  // wheels: pivot (steer) -> spinner (roll)
  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (P.w / 2 - 0.12), 0.34, sz * P.wb);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(tireGeo, tireMat);
    t.castShadow = true;
    spin.add(t);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(rim);
    pivot.add(spin);
    root.add(pivot);
    wheels.push(spin);
    if (sz > 0) steer.push(pivot);
  }
  // dark wheel arches so the body does not look hollow
  for (const sz of [1, -1]) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(P.w - 0.02, 0.32, 0.86), trimMat);
    arch.position.set(0, 0.55, sz * P.wb);
    body.add(arch);
  }
  // soft contact shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(P.w + 0.5, P.len + 0.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // merge: painted parts into one vertex-coloured mesh, glass and lights stay separate
  bake(body, new Set<THREE.Material>([paint, trimMat, chromeMat, plateMat, signMat, checkMat]), vcMaterial(0.38, 0.45));
  for (const w of wheels.slice(0, 2)) bake(w, new Set<THREE.Material>([tireMat, rimMat]), vcMaterial(0.7, 0.4));
  // rear wheels are merged into the body (they still look right; only the front ones steer)
  bake(root, new Set<THREE.Material>([tireMat, rimMat, paint, trimMat, chromeMat, plateMat, signMat, checkMat]), vcMaterial(0.38, 0.45), new Set([steer[0], steer[1], beam, shadow]));
  wheels.length = 2;
  return {
    root,
    kind,
    length: P.len,
    width: P.w,
    wheels,
    steer,
    setLights(night, brake) {
      headMat.emissiveIntensity = 0.2 + night * 3;
      tailMat.emissiveIntensity = brake ? 3.5 : 0.3 + night * 1.6;
      beamMat.opacity = night * 0.1;
      beam.visible = night > 0.05;
    },
  };
}
