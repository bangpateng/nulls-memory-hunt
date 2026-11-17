// The four Nulls in 3D, modelled after the original artwork: tall figures with a round black head,
// thin black arms, baggy trousers and chunky shoes, drawn with cel shading and a black ink outline.
import * as THREE from "three";
import type { CharId } from "./data";
import { bake } from "./bake";

// ---------- materials ----------
let gradient: THREE.DataTexture | null = null;
function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
const std = new Map<string, THREE.MeshStandardMaterial>();
/** Shared lit material for props (boxes, the Game House room). */
export function toon(color: number, emissive = 0): THREE.MeshStandardMaterial {
  const k = `${color}-${emissive}`;
  let m = std.get(k);
  if (!m) std.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02, emissive, emissiveIntensity: emissive ? 1 : 0 })));
  return m;
}
const cels = new Map<number, THREE.MeshToonMaterial>();
const cel = (color: number) => {
  let m = cels.get(color);
  if (!m) cels.set(color, (m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() })));
  return m;
};
const glowMat = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: color, emissiveIntensity: 0.6 });
const celVC = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
const ink = new THREE.MeshBasicMaterial({ color: 0x06050a, side: THREE.BackSide });
ink.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed += normalize(normal) * 0.016;");
};

const SKIN = 0x0a090d;
const HEAD_R = 0.21;
const HIP = 0.98;

export interface CharModel {
  root: THREE.Group;
  /** speed 0..1 of max, airborne, glow on (ability active) */
  animate(dt: number, speed: number, air: boolean, ability: boolean): void;
}
interface Limbs {
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
}
type Built = { root: THREE.Group; L: Limbs; glow: THREE.Mesh[] };

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}
const cylG = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphG = (r: number) => new THREE.SphereGeometry(r, 20, 14);
const boxG = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

interface Outfit {
  top: number; // torso colour
  pants: number;
  shoe: number;
  sole: number;
  shoeAccent?: number;
  sleeves: "long" | "short" | "rolled";
  sleeve?: number;
  cuff?: number;
  hem?: number;
  boots?: boolean;
}

function baseBody(o: Outfit): { root: THREE.Group; L: Limbs } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP;
  root.add(body);
  const skin = cel(SKIN);
  const top = cel(o.top),
    pants = cel(o.pants);

  // torso: slightly boxy, wider at the shoulders, loose at the hem
  add(body, cylG(0.2, 0.235, 0.46, 16), top, 0, 0.25, 0, 0, 0, 0, 1.05, 1, 0.74);
  add(body, sphG(0.2), top, 0, 0.45, 0, 0, 0, 0, 1.12, 0.36, 0.78);
  if (o.hem !== undefined) add(body, cylG(0.252, 0.252, 0.075, 16), cel(o.hem), 0, 0.045, 0, 0, 0, 0, 1.0, 1, 0.74);
  // hips (top of the trousers)
  add(body, cylG(0.225, 0.24, 0.16, 16), pants, 0, -0.04, 0, 0, 0, 0, 1.0, 1, 0.74);
  // neck
  add(body, cylG(0.045, 0.05, 0.16, 10), skin, 0, 0.55, 0);

  const head = new THREE.Group();
  head.position.y = 0.8;
  head.scale.setScalar(1.2);
  body.add(head);
  add(head, sphG(HEAD_R), skin, 0, 0, 0, 0, 0, 0, 1.04, 0.97, 1);

  // arms: thin black, with the sleeve of the outfit
  const mkArm = (s: number) => {
    const a = new THREE.Group();
    a.position.set(s * 0.255, 0.44, 0);
    add(a, cylG(0.04, 0.036, 0.66, 10), skin, 0, -0.33, 0);
    add(a, sphG(0.062), skin, 0, -0.69, 0, 0, 0, 0, 1, 1.15, 1);
    const sc = cel(o.sleeve ?? o.top);
    if (o.sleeves === "long") {
      add(a, cylG(0.075, 0.098, 0.56, 12), sc, 0, -0.27, 0);
      add(a, sphG(0.078), sc, 0, 0, 0);
      add(a, cylG(0.088, 0.08, 0.07, 12), cel(o.cuff ?? o.top), 0, -0.58, 0);
    } else if (o.sleeves === "short") {
      add(a, cylG(0.095, 0.125, 0.2, 12), sc, s * 0.01, -0.07, 0);
      add(a, sphG(0.085), sc, 0, 0.01, 0);
    } else {
      add(a, cylG(0.085, 0.1, 0.3, 12), sc, 0, -0.14, 0);
      add(a, sphG(0.08), sc, 0, 0, 0);
      add(a, cylG(0.11, 0.11, 0.07, 12), sc, 0, -0.31, 0);
    }
    a.rotation.z = s * 0.13;
    body.add(a);
    return a;
  };
  const armL = mkArm(-1),
    armR = mkArm(1);

  // legs: baggy trousers that bunch up over chunky shoes
  const mkLeg = (s: number) => {
    const l = new THREE.Group();
    l.position.set(s * 0.12, HIP, 0);
    l.rotation.z = s * 0.075;
    add(l, cylG(0.118, 0.15, 0.78, 14), pants, 0, -0.39, 0);
    add(l, cylG(0.162, 0.148, 0.13, 14), pants, 0, -0.76, 0.01);
    const sole = cel(o.sole),
      up = cel(o.shoe);
    const h = o.boots ? 0.17 : 0.13;
    add(l, boxG(0.21, 0.07, 0.44), sole, 0, -0.945, 0.07);
    add(l, boxG(0.19, h, 0.3), up, 0, -0.91 + h / 2, 0.02);
    add(l, sphG(0.1), up, 0, -0.88, 0.2, 0, 0, 0, 0.95, 0.75, 1.15);
    if (o.shoeAccent !== undefined) {
      add(l, boxG(0.2, 0.06, 0.12), cel(o.shoeAccent), 0, -0.875, -0.1);
      add(l, sphG(0.06), cel(o.shoeAccent), 0, -0.9, 0.27, 0, 0, 0, 1.5, 0.6, 0.8);
    }
    root.add(l);
    return l;
  };
  const legL = mkLeg(-1),
    legR = mkLeg(1);
  return { root, L: { armL, armR, legL, legR, body, head } };
}

/** White crescent eye on the black face. dir: which way the dark part is pushed (+1 = right). */
function eye(head: THREE.Group, x: number, y: number, r = 0.066, angry = 0) {
  const z = Math.sqrt(Math.max(0.0001, HEAD_R * HEAD_R - x * x - y * y)) + 0.014;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = Math.asin(x / HEAD_R) * 0.8;
  head.add(g);
  const dark = new THREE.MeshBasicMaterial({ color: SKIN });
  add(g, new THREE.CircleGeometry(r, 28), white);
  add(g, new THREE.CircleGeometry(r * 0.72, 28), dark, r * 0.3, r * 0.24, 0.004);
  if (angry) add(g, new THREE.PlaneGeometry(r * 3, r * 1.2), dark, 0, r * 1.1, 0.006, 0, 0, angry);
}

function backpack(body: THREE.Group, main: number, trim: number) {
  add(body, boxG(0.36, 0.42, 0.17), cel(main), 0, 0.26, -0.24);
  add(body, boxG(0.28, 0.17, 0.08), cel(trim), 0, 0.14, -0.35);
  add(body, sphG(0.18), cel(main), 0, 0.44, -0.24, 0, 0, 0, 1, 0.5, 0.48);
  for (const s of [-1, 1]) {
    add(body, boxG(0.055, 0.42, 0.03), cel(trim), s * 0.16, 0.3, 0.185, -0.1, 0, 0);
    add(body, boxG(0.055, 0.03, 0.36), cel(trim), s * 0.16, 0.5, 0);
    add(body, boxG(0.075, 0.04, 0.035), cel(main), s * 0.16, 0.33, 0.2);
  }
}

// ---------- RHEA: cat ears, laurel wreath, green hoodie ----------
function buildRhea(): Built {
  const LIGHT = 0xa9dc8c,
    DARK = 0x17352f;
  const { root, L } = baseBody({ top: DARK, pants: 0x23232b, shoe: 0xf2f2f4, sole: 0xdcdce2, shoeAccent: 0x3a3d34, sleeves: "long", cuff: LIGHT, hem: LIGHT });
  const skin = cel(SKIN);
  // big pointed ears with a violet inside, plus two small tufts
  for (const s of [-1, 1]) {
    add(L.head, new THREE.ConeGeometry(0.085, 0.3, 4), skin, s * 0.16, 0.24, -0.01, 0, Math.PI / 4, -s * 0.55);
    add(L.head, new THREE.ConeGeometry(0.05, 0.22, 4), cel(0x6a6fc0), s * 0.17, 0.235, 0.025, 0, Math.PI / 4, -s * 0.55);
  }
  add(L.head, new THREE.ConeGeometry(0.04, 0.13, 4), skin, -0.2, -0.1, -0.04, 0, 0, 1.9);
  add(L.head, new THREE.ConeGeometry(0.035, 0.12, 4), cel(0x6a6fc0), -0.05, -0.2, -0.1, 0, 0, 2.9);
  // laurel wreath: leaves around both sides of the brow
  for (const s of [-1, 1])
    for (let k = 0; k < 5; k++) {
      const a = 0.55 + k * 0.33;
      const x = s * Math.sin(a) * 0.2,
        z = Math.cos(a) * 0.2;
      add(L.head, sphG(0.05), cel(k % 2 ? 0x1f5a50 : LIGHT), x, 0.1 + k * 0.012, z, 0, 0, s * (0.5 - k * 0.1), 0.85, 0.3, 0.42);
    }
  eye(L.head, -0.085, -0.025);
  eye(L.head, 0.085, -0.025);
  // hoodie: hood folded at the neck, sleeve stripes, glowing paw print
  add(L.body, new THREE.TorusGeometry(0.115, 0.05, 10, 20), cel(LIGHT), 0, 0.52, -0.03, Math.PI / 2 - 0.25, 0, 0);
  add(L.body, new THREE.TorusGeometry(0.125, 0.045, 10, 20), cel(DARK), 0, 0.5, -0.04, Math.PI / 2 - 0.25, 0, 0);
  for (const [a, s] of [
    [L.armL, -1],
    [L.armR, 1],
  ] as const)
    add(a, boxG(0.035, 0.46, 0.075), cel(LIGHT), s * 0.085, -0.24, 0);
  const pawMat = new THREE.MeshBasicMaterial({ color: 0x4dffb0, toneMapped: false });
  add(L.body, new THREE.CircleGeometry(0.028, 12), pawMat, -0.09, 0.34, 0.176);
  for (const [dx, dy] of [
    [-0.035, 0.03],
    [-0.012, 0.045],
    [0.012, 0.045],
    [0.035, 0.03],
  ])
    add(L.body, new THREE.CircleGeometry(0.011, 8), pawMat, -0.09 + dx, 0.34 + dy, 0.176);
  add(L.body, boxG(0.26, 0.1, 0.02), cel(0x12302a), 0, 0.14, 0.185);
  return { root, L, glow: [] };
}

// ---------- NOIR WALLET: hood, round goggles, cargo trousers, backpack ----------
function buildNoir(): Built {
  const LIGHT = 0x8fe0a0,
    DARK = 0x14302c;
  const { root, L } = baseBody({ top: DARK, pants: 0x181c1c, shoe: 0x1c2422, sole: 0x2fa35e, sleeves: "long", cuff: LIGHT, hem: LIGHT });
  // hood over the head, black face showing in front
  add(L.head, sphG(0.245), cel(0x1b3a36), 0, 0.02, -0.045, 0, 0, 0, 1.02, 1.04, 1);
  add(L.head, new THREE.ConeGeometry(0.12, 0.16, 12), cel(0x1b3a36), 0, 0.22, -0.12, -0.7, 0, 0);
  add(L.head, new THREE.TorusGeometry(0.185, 0.022, 8, 28), cel(LIGHT), 0, 0.03, 0.1, 0.1, 0, 0, 1, 1.08, 1);
  add(L.head, sphG(0.13), cel(0x1b3a36), 0, -0.2, -0.03, 0, 0, 0, 1.3, 0.5, 1);
  // goggles
  const lens = glowMat(0x1f9a8e);
  const glow: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    add(L.head, new THREE.TorusGeometry(0.074, 0.017, 10, 24), cel(0xc6eadb), s * 0.085, 0.0, 0.205, 0, s * 0.3, 0);
    glow.push(add(L.head, new THREE.CircleGeometry(0.07, 24), lens, s * 0.085, 0.0, 0.207, 0, s * 0.3, 0));
    add(L.head, new THREE.CircleGeometry(0.014, 8), white, s * 0.085 + 0.03, 0.03, 0.212, 0, s * 0.3, 0);
  }
  add(L.head, boxG(0.05, 0.016, 0.016), cel(0xc6eadb), 0, 0.01, 0.222);
  // green front panel and pale edges
  add(L.body, boxG(0.3, 0.33, 0.02), cel(0x2e9a5e), 0, 0.27, 0.172);
  add(L.body, boxG(0.34, 0.03, 0.02), cel(LIGHT), 0, 0.445, 0.168);
  backpack(L.body, 0x1d3f3a, 0x2c5a50);
  // cargo pockets
  for (const [leg, s] of [
    [L.legL, -1],
    [L.legR, 1],
  ] as const) {
    add(leg, boxG(0.07, 0.2, 0.2), cel(0x1f2424), s * 0.15, -0.36, 0);
    add(leg, boxG(0.085, 0.05, 0.22), cel(0x2a302f), s * 0.15, -0.27, 0);
    add(leg, boxG(0.09, 0.012, 0.225), cel(LIGHT), s * 0.15, -0.243, 0);
  }
  return { root, L, glow };
}

// ---------- METEORA WALLET: purple cap with the comet badge, mauve tee, backpack, boots ----------
function buildMeteora(): Built {
  const MAUVE = 0x8e6190;
  const { root, L } = baseBody({ top: MAUVE, pants: 0x33282f, shoe: 0x3d2360, sole: 0x2a1745, sleeves: "short", boots: true });
  const R = 0.228;
  // cap: dark front panel, mauve back panel, mauve brim, button on top
  add(L.head, new THREE.SphereGeometry(R, 20, 10, 0, Math.PI, 0, Math.PI / 2), cel(0x2a1640), 0, 0.03, 0, 0, 0, 0, 1.03, 1.05, 1);
  add(L.head, new THREE.SphereGeometry(R, 20, 10, Math.PI, Math.PI, 0, Math.PI / 2), cel(MAUVE), 0, 0.03, 0, 0, 0, 0, 1.03, 1.05, 1);
  add(L.head, cylG(R * 1.03, R * 1.03, 0.03, 24), cel(0x2a1640), 0, 0.035, 0);
  add(L.head, new THREE.CylinderGeometry(0.19, 0.19, 0.022, 20, 1, false, -Math.PI / 2, Math.PI), cel(0x7d5687), 0, 0.03, 0.17, 0.16, 0, 0, 1, 1, 1.35);
  add(L.head, sphG(0.025), cel(0x7d5687), 0, 0.27, 0);
  // badge with the white comet
  const badge = new THREE.Group();
  badge.position.set(0, 0.15, 0.185);
  badge.rotation.x = -0.62;
  L.head.add(badge);
  add(badge, new THREE.CircleGeometry(0.068, 24), new THREE.MeshBasicMaterial({ color: 0x4a2be0 }), 0, 0, 0.0);
  add(badge, new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0xd9d0ff }), -0.012, -0.008, 0.002);
  for (const k of [0, 1, 2]) add(badge, new THREE.PlaneGeometry(0.035, 0.011), new THREE.MeshBasicMaterial({ color: 0xd9d0ff }), 0.022, 0.016 - k * 0.014, 0.002, 0, 0, 0.5);
  // eyes: sharp, a little grumpy under the brim
  eye(L.head, -0.085, -0.04, 0.064, 0.3);
  eye(L.head, 0.085, -0.04, 0.064, -0.3);
  backpack(L.body, 0x4a2d6b, 0x5d3d85);
  return { root, L, glow: [] };
}

// ---------- NAXWEB3: spiky hair, blue beanie band, orange shades, gold chain, denim overalls ----------
function buildNax(): Built {
  const DENIM = 0x2a4372,
    CREAM = 0xeedcae;
  const { root, L } = baseBody({ top: CREAM, pants: DENIM, shoe: 0xf4f4f6, sole: 0xe6e8ee, shoeAccent: 0x2b55b0, sleeves: "rolled" });
  const skin = cel(SKIN);
  // hair: black spikes with orange behind them
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2;
    const up = 0.55 + (i % 3) * 0.22;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(up), Math.sin(up), Math.cos(a) * Math.cos(up)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const len = 0.4 + (i % 2) * 0.1;
    const sp = add(L.head, new THREE.ConeGeometry(0.095, len, 5), skin, dir.x * 0.22, 0.06 + dir.y * 0.22, dir.z * 0.22);
    sp.quaternion.copy(q);
    const or = add(L.head, new THREE.ConeGeometry(0.07, len * 0.85, 5), cel(0xf0a04a), dir.x * 0.2 - Math.sin(a) * 0.03, 0.04 + dir.y * 0.2, dir.z * 0.2 - 0.045);
    or.quaternion.copy(q);
  }
  add(L.head, sphG(0.2), skin, 0, 0.1, -0.01);
  // beanie band, tilted
  add(L.head, cylG(0.222, 0.226, 0.13, 28), cel(0x1a37c8), 0, 0.11, 0, -0.14, 0, 0);
  // round orange sunglasses with gold rims
  const lens = glowMat(0xd9670f);
  const glow: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    add(L.head, new THREE.TorusGeometry(0.07, 0.012, 8, 24), cel(0xe0aa3c), s * 0.085, -0.03, 0.2, 0, s * 0.3, 0);
    glow.push(add(L.head, new THREE.CircleGeometry(0.068, 24), lens, s * 0.085, -0.03, 0.201, 0, s * 0.3, 0));
    add(L.head, new THREE.CircleGeometry(0.012, 8), white, s * 0.085 + 0.025, 0.0, 0.207, 0, s * 0.3, 0);
    add(L.head, boxG(0.01, 0.01, 0.2), cel(0xe0aa3c), s * 0.17, -0.02, 0.08);
  }
  add(L.head, boxG(0.04, 0.012, 0.012), cel(0xe0aa3c), 0, -0.02, 0.215);
  add(L.head, sphG(0.02), glowMat(0x2ad0ff), -0.2, -0.1, 0.02);
  // shirt collar, gold chain, overalls bib with straps and buttons
  for (const s of [-1, 1]) add(L.body, boxG(0.1, 0.03, 0.09), cel(CREAM), s * 0.07, 0.5, 0.1, 0.5, 0, s * 0.5);
  const chain = add(L.body, new THREE.TorusGeometry(0.105, 0.02, 8, 22), glowMat(0xe2a93a), 0, 0.44, 0.09, Math.PI / 2 - 0.75, 0, 0, 1, 1.25, 1);
  glow.push(chain);
  add(L.body, boxG(0.3, 0.27, 0.022), cel(DENIM), 0, 0.2, 0.176);
  add(L.body, boxG(0.16, 0.1, 0.01), cel(0x243a64), 0, 0.23, 0.19);
  add(L.body, cylG(0.24, 0.245, 0.14, 16), cel(DENIM), 0, 0.06, 0, 0, 0, 0, 1.03, 1, 0.76);
  add(L.body, boxG(0.44, 0.035, 0.03), cel(0x243a64), 0, 0.11, 0.18);
  for (const s of [-1, 1]) {
    add(L.body, boxG(0.05, 0.24, 0.02), cel(DENIM), s * 0.115, 0.42, 0.165, -0.2, 0, 0);
    add(L.body, boxG(0.05, 0.03, 0.34), cel(DENIM), s * 0.13, 0.515, 0);
    add(L.body, boxG(0.05, 0.5, 0.02), cel(DENIM), s * 0.1, 0.3, -0.175, 0, 0, s * 0.25);
    add(L.body, sphG(0.016), cel(0xe0aa3c), s * 0.115, 0.325, 0.19);
  }
  return { root, L, glow };
}

export function buildCharacter(id: CharId): CharModel {
  const { root, L, glow } = id === "noir" ? buildNoir() : id === "meteora" ? buildMeteora() : id === "naxweb3" ? buildNax() : buildRhea();
  // merge the many small parts of each moving piece, then give each piece its ink outline
  const groups = new Set<THREE.Object3D>([L.body, L.head, L.armL, L.armR, L.legL, L.legR]);
  const paint = new Set<THREE.Material>(cels.values());
  for (const gr of groups) bake(gr, paint, celVC, new Set([...groups].filter((x) => x !== gr)));
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === celVC) {
      const line = new THREE.Mesh(m.geometry, ink);
      line.userData.ink = true;
      m.add(line);
    }
  });
  const glowMats = [...new Set(glow.map((g) => g.material as THREE.MeshToonMaterial))];
  let t = Math.random() * 10;
  let phase = 0;
  return {
    root,
    animate(dt, speed, air, ability) {
      t += dt;
      phase += dt * (4 + speed * 8);
      const swing = air ? 0 : Math.sin(phase) * 0.75 * speed;
      L.legL.rotation.x = air ? -0.55 : swing;
      L.legR.rotation.x = air ? 0.3 : -swing;
      L.armL.rotation.x = air ? -2.3 : -swing * 0.85;
      L.armR.rotation.x = air ? -2.1 : swing * 0.85;
      const bob = air ? 0 : Math.abs(Math.sin(phase)) * 0.045 * speed + Math.sin(t * 2) * 0.008 * (1 - speed);
      L.body.position.y = HIP + bob;
      L.body.rotation.x = speed * 0.1;
      L.head.rotation.z = Math.sin(t * 1.3) * 0.035 * (1 - speed);
      for (const m of glowMats) m.emissiveIntensity = ability ? 2 + Math.sin(t * 8) * 0.5 : 0.6;
    },
  };
}
