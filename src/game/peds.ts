// Pedestrians: simple low-poly townspeople who walk loops around the blocks and step aside
// when a car or the player gets too close.
import * as THREE from "three";
import { rng } from "./data";
import { SW } from "./city";
import { bake, vcMaterial } from "./bake";

const SKIN = [0xe0b48f, 0xc68e64, 0x8d5a3b, 0x5a3825, 0xf0c9a8];
const SHIRT = [0x3a5a8a, 0xa83232, 0xe0d8c8, 0x2f2f33, 0x3f6b4a, 0xc9a23a, 0x6a4a8a, 0x8a8a8a, 0xd06a2a];
const PANTS = [0x22262e, 0x3a3f4a, 0x4a3a2a, 0x1f3550, 0x6b6b6b];
const HAIR = [0x1a1410, 0x3a2414, 0x6b4a2a, 0xb8a080, 0x0d0d0d];

const mat = new Map<number, THREE.MeshStandardMaterial>();
const m = (c: number) => {
  let x = mat.get(c);
  if (!x) mat.set(c, (x = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })));
  return x;
};

interface Ped {
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  loop: [number, number, number, number];
  s: number; // position along the loop perimeter
  dir: 1 | -1;
  speed: number;
  phase: number;
  dodge: number; // seconds of stepping aside
  side: THREE.Vector2;
}

function limb(w: number, h: number, d: number, mt: THREE.Material, y: number) {
  const pivot = new THREE.Group();
  pivot.position.y = y;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function buildPed(r: () => number) {
  const root = new THREE.Group();
  const skin = m(SKIN[Math.floor(r() * SKIN.length)]);
  const shirt = m(SHIRT[Math.floor(r() * SHIRT.length)]);
  const pants = m(PANTS[Math.floor(r() * PANTS.length)]);
  const shoes = m(0x1a1a1a);
  const tall = 0.92 + r() * 0.16;
  const legL = limb(0.17, 0.86, 0.2, pants, 0.92);
  const legR = limb(0.17, 0.86, 0.2, pants, 0.92);
  legL.position.x = -0.11;
  legR.position.x = 0.11;
  for (const l of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.3), shoes);
    shoe.position.set(0, -0.86, 0.05);
    l.add(shoe);
    root.add(l);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
  torso.position.y = 1.24;
  torso.castShadow = true;
  root.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), pants);
  hips.position.y = 0.92;
  root.add(hips);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin);
  neck.position.y = 1.6;
  root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.scale.set(1, 1.15, 1.05);
  head.position.y = 1.77;
  head.castShadow = true;
  root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * (r() < 0.3 ? 0.62 : 0.45)), m(HAIR[Math.floor(r() * HAIR.length)]));
  hair.position.y = 1.79;
  hair.rotation.x = -0.25;
  root.add(hair);
  const armL = limb(0.12, 0.6, 0.13, shirt, 1.52);
  const armR = limb(0.12, 0.6, 0.13, shirt, 1.52);
  armL.position.x = -0.3;
  armR.position.x = 0.3;
  for (const a of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.1), skin);
    hand.position.y = -0.64;
    a.add(hand);
    root.add(a);
  }
  if (r() < 0.25) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.36), m(0x4a2a1a));
    bag.position.set(0.05, -0.72, 0);
    armR.add(bag);
  }
  const all = new Set<THREE.Material>(mat.values());
  const vc = vcMaterial(0.85, 0);
  for (const l of [legL, legR, armL, armR]) bake(l, all, vc);
  bake(root, all, vc, new Set([legL, legR, armL, armR]));
  root.scale.setScalar(tall);
  return { root, legL, legR, armL, armR };
}

export class Pedestrians {
  peds: Ped[] = [];
  group = new THREE.Group();
  constructor(loops: [number, number, number, number][], count: number) {
    const r = rng(4242);
    for (let i = 0; i < count; i++) {
      const loop = loops[Math.floor(r() * loops.length)];
      const p = buildPed(r);
      this.group.add(p.root);
      const per = 2 * (loop[2] - loop[0] + loop[3] - loop[1]);
      this.peds.push({ ...p, loop, s: r() * per, dir: r() < 0.5 ? 1 : -1, speed: 1.1 + r() * 0.5, phase: r() * 6, dodge: 0, side: new THREE.Vector2() });
    }
  }

  private pointOn(loop: Ped["loop"], s: number): [number, number, number] {
    const [x0, z0, x1, z1] = loop;
    const w = x1 - x0,
      d = z1 - z0,
      per = 2 * (w + d);
    s = ((s % per) + per) % per;
    if (s < w) return [x0 + s, z0, Math.PI / 2];
    s -= w;
    if (s < d) return [x1, z0 + s, 0];
    s -= d;
    if (s < w) return [x1 - s, z1, -Math.PI / 2];
    s -= w;
    return [x0, z1 - s, Math.PI];
  }

  /** threats: positions of the player and moving cars the walkers keep away from */
  update(dt: number, threats: { x: number; z: number; r: number }[], center: THREE.Vector3): boolean {
    let scared = false;
    for (const p of this.peds) {
      const [x, z, face] = this.pointOn(p.loop, p.s);
      // hide far away walkers to save time
      const far = Math.abs(x - center.x) > 60 || Math.abs(z - center.z) > 60;
      p.root.visible = !far;
      if (far) {
        p.s += p.dir * p.speed * dt;
        continue;
      }
      let wantSide = 0;
      for (const t of threats) {
        const dx = x + p.side.x - t.x,
          dz = z + p.side.y - t.z;
        if (dx * dx + dz * dz < t.r * t.r) {
          if (p.dodge <= 0 && t.r > 2) scared = true;
          p.dodge = 1.2;
          const l = Math.hypot(dx, dz) || 1;
          p.side.x += (dx / l) * dt * 4;
          p.side.y += (dz / l) * dt * 4;
          wantSide = 1;
        }
      }
      if (p.dodge > 0) p.dodge -= dt;
      else if (!wantSide) p.side.multiplyScalar(1 - Math.min(1, dt * 1.5));
      p.side.clampLength(0, 1.4);
      const walking = p.dodge <= 0;
      if (walking) p.s += p.dir * p.speed * dt;
      p.phase += dt * (walking ? p.speed * 5.2 : 9);
      p.root.position.set(x + p.side.x, SW, z + p.side.y);
      p.root.rotation.y = face + (p.dir < 0 ? Math.PI : 0);
      const sw = Math.sin(p.phase) * 0.55;
      p.legL.rotation.x = sw;
      p.legR.rotation.x = -sw;
      p.armL.rotation.x = -sw * 0.8;
      p.armR.rotation.x = sw * 0.8;
      if (!walking) {
        p.armL.rotation.x = p.armR.rotation.x = -2.4; // hands up!
      }
    }
    return scared;
  }

  /** Walkers block the player like soft obstacles. */
  near(x: number, z: number, rad: number) {
    for (const p of this.peds) {
      if (!p.root.visible) continue;
      const dx = x - p.root.position.x,
        dz = z - p.root.position.z;
      if (dx * dx + dz * dz < rad * rad) return p.root.position;
    }
    return null;
  }
}
