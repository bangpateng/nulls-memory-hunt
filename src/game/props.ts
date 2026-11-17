// Cardboard boxes, memory cards, cars, and the inside of the Game House.
import * as THREE from "three";
import { toon } from "./characters";
import type { CardDef } from "./data";
import type { Collider } from "./city";
import { textTex } from "./city";
import { bake, vcMaterial } from "./bake";
import { brickPlain, floorWood, rep, wallpaper, woodTex } from "./textures";
import { CARDS } from "./data";

// ---------- memory card ----------
const cardTexCache = new Map<string, THREE.CanvasTexture>();
export function cardTexture(card: Pick<CardDef, "id" | "color" | "dark">): THREE.CanvasTexture {
  let t = cardTexCache.get(card.id);
  if (t) return t;
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 320;
  const c = cv.getContext("2d")!;
  c.fillStyle = card.color;
  c.beginPath();
  c.roundRect(4, 4, 248, 312, 20);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.08)";
  for (let y = 8; y < 316; y += 6) c.fillRect(4, y, 248, 2);
  c.fillStyle = card.dark;
  c.beginPath();
  c.moveTo(128, 22);
  c.lineTo(150, 44);
  c.lineTo(106, 44);
  c.fill();
  c.font = "italic 900 92px Inter, sans-serif";
  c.textAlign = "center";
  c.fillText("n", 128, 130);
  c.font = "bold 22px Inter, sans-serif";
  c.fillText("MEMORY CARD", 128, 166);
  c.fillStyle = "#f6e7c4";
  c.strokeStyle = "#1a1418";
  c.lineWidth = 4;
  c.beginPath();
  c.roundRect(36, 184, 184, 104, 10);
  c.fill();
  c.stroke();
  c.fillStyle = "#121014";
  c.beginPath();
  c.arc(128, 222, 20, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#121014";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(138, 204);
  c.lineTo(146, 194);
  c.stroke();
  c.font = "italic bold 22px Inter, sans-serif";
  c.fillText("DO NOT ERASE", 128, 270);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  cardTexCache.set(card.id, t);
  return t;
}

export function buildCard(card: Pick<CardDef, "id" | "color" | "dark">, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.MeshBasicMaterial({ map: cardTexture(card), toneMapped: false });
  const edge = new THREE.MeshBasicMaterial({ color: card.dark });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.8, 0.07), [edge, edge, edge, edge, face, face]);
  g.add(body);
  const pins = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.072), new THREE.MeshBasicMaterial({ color: 0xf2c12e }));
  pins.position.y = -0.44;
  g.add(pins);
  g.scale.setScalar(scale);
  return g;
}

// ---------- cardboard box ----------
const cardboard = () => toon(0xb7834e);
const tape = () => toon(0xd9b36a);
export interface BoxModel {
  root: THREE.Group;
  flaps: THREE.Object3D[];
  glow: THREE.Mesh;
  open(t: number): void; // 0 closed .. 1 open
}
export function buildBox(): BoxModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), cardboard());
  body.position.y = 0.35;
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.2), tape());
  strip.position.set(0, 0.62, 0);
  root.add(strip);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshBasicMaterial({ map: textTex("?", "#2a1a10", "#e9d3a6", 128, 80, "bold 56px 'Press Start 2P', monospace") }));
  label.position.set(0, 0.36, 0.456);
  root.add(label);
  const flaps: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.45, 0.7, 0);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.9), cardboard());
    flap.position.x = -s * 0.225;
    pivot.add(flap);
    root.add(pivot);
    flaps.push(pivot);
  }
  // night-vision glow: a ring of light under boxes that hold a card
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x5dff9e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  glow.visible = false;
  root.add(glow);
  bake(root, new Set<THREE.Material>([cardboard(), tape()]), vcMaterial(0.9, 0), new Set([...flaps, glow, strip]));
  return {
    root,
    flaps,
    glow,
    open(t) {
      flaps[0].rotation.z = -t * 2.2;
      flaps[1].rotation.z = t * 2.2;
      strip.visible = t < 0.05;
    },
  };
}


// ---------- the inside of the Game House: a retro gamer's den ----------
export const INTERIOR_ORIGIN = new THREE.Vector3(0, 0, 400);
export interface Interior {
  group: THREE.Group;
  colliders: Collider[];
  spawn: THREE.Vector3;
  spots: { id: "gameboy" | "bed" | "wardrobe" | "door" | "shop"; x: number; z: number; label: string }[];
  shelf: THREE.Group; // memory cards on display
  bounds: { hx: number; hz: number; h: number };
  tick(t: number): void;
}

function canvasMat(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, bright = 1) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(bright, bright, bright) });
}

export function buildInterior(): Interior {
  const g = new THREE.Group();
  const O = INTERIOR_ORIGIN;
  const W = 16,
    D = 12,
    H = 4.4;
  const S = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
  const mk = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };
  const cy = (rt: number, rb: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 20) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const plane = (w: number, h: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    g.add(b);
    return b;
  };
  const led = (c: number, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const colliders: Collider[] = [];
  const col = (minX: number, maxX: number, minZ: number, maxZ: number, top: number) =>
    colliders.push({ minX: O.x + minX, maxX: O.x + maxX, minZ: O.z + minZ, maxZ: O.z + maxZ, top });

  // ----- shell: wooden floor, brick back wall, wallpaper, wainscot, beams -----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), S({ map: rep(floorWood(), 5, 4), roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  const brick = S({ map: rep(brickPlain(), 5, 1.6), roughness: 0.95 });
  const paper = S({ map: rep(wallpaper(), 8, 3) });
  const dark = S({ color: 0x3a2618, map: rep(woodTex(), 4, 1), roughness: 0.6 });
  const wood = S({ color: 0xb98a5a, map: rep(woodTex(), 1, 1), roughness: 0.6 });
  const black = S({ color: 0x16161a, roughness: 0.5 });
  mk(W, H, 0.3, 0, H / 2, -D / 2 - 0.15, brick);
  mk(0.3, H, D, -W / 2 - 0.15, H / 2, 0, paper);
  mk(0.3, H, D, W / 2 + 0.15, H / 2, 0, paper);
  mk(W / 2 - 1.1, H, 0.3, -W / 4 - 0.55, H / 2, D / 2 + 0.15, paper);
  mk(W / 2 - 1.1, H, 0.3, W / 4 + 0.55, H / 2, D / 2 + 0.15, paper);
  mk(2.2, H - 3, 0.3, 0, 3 + (H - 3) / 2, D / 2 + 0.15, paper);
  // wainscot and skirting
  mk(0.08, 1.1, D, -W / 2 + 0.04, 0.55, 0, dark);
  mk(0.08, 1.1, D, W / 2 - 0.04, 0.55, 0, dark);
  mk(W / 2 - 1.1, 1.1, 0.08, -W / 4 - 0.55, 0.55, D / 2 - 0.04, dark);
  mk(W / 2 - 1.1, 1.1, 0.08, W / 4 + 0.55, 0.55, D / 2 - 0.04, dark);
  mk(W, 0.16, 0.1, 0, 0.08, -D / 2 + 0.05, dark);
  // ceiling with beams
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), S({ color: 0x2a2530 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  g.add(ceil);
  for (const z of [-4, -1.3, 1.3, 4]) mk(W, 0.28, 0.3, 0, H - 0.14, z, dark);
  // door: frame and daylight outside
  mk(0.16, 3.1, 0.4, -1.18, 1.55, D / 2 + 0.1, dark);
  mk(0.16, 3.1, 0.4, 1.18, 1.55, D / 2 + 0.1, dark);
  mk(2.5, 0.16, 0.4, 0, 3.08, D / 2 + 0.1, dark);
  plane(2.2, 3, 0, 1.5, D / 2 + 0.28, led(0xcfe8ff, 1.5), Math.PI);
  mk(1.8, 0.03, 1, 0, 0.015, D / 2 - 0.7, S({ color: 0x7a2a22, roughness: 1 }));
  // windows with the city outside
  const view = canvasMat(256, 160, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, "#5aa0e6");
    sky.addColorStop(1, "#cfe6f6");
    c.fillStyle = sky;
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = "rgba(255,255,255,0.8)";
    for (const [x, y, r] of [[60, 40, 16], [80, 44, 20], [104, 42, 14], [190, 28, 14], [208, 30, 18]]) {
      c.beginPath();
      c.arc(x, y, r, 0, 7);
      c.fill();
    }
    const cols = ["#8a5a4a", "#9a968e", "#6f8fa0", "#c9b896", "#5e4a44"];
    for (let k = 0; k < 9; k++) {
      const h = 50 + ((k * 37) % 60);
      c.fillStyle = cols[k % 5];
      c.fillRect(k * 30 - 6, 160 - h, 28, h);
      c.fillStyle = "rgba(20,30,40,0.5)";
      for (let y = 160 - h + 6; y < 156; y += 12) for (let x = 0; x < 3; x++) c.fillRect(k * 30 - 2 + x * 8, y, 5, 7);
    }
  }, 1.25);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.02);
    plane(3, 1.9, x, 2.45, -2, view, -s * Math.PI / 2);
    mk(0.14, 0.12, 3.3, x - s * 0.05, 3.45, -2, dark);
    mk(0.18, 0.12, 3.4, x - s * 0.08, 1.45, -2, dark);
    for (const z of [-3.6, -2, -0.4]) mk(0.12, 2, 0.1, x - s * 0.05, 2.45, z, dark);
    mk(0.1, 0.08, 3.2, x - s * 0.05, 2.45, -2, dark);
    // curtains
    mk(0.1, 2.3, 0.5, x - s * 0.1, 2.45, -3.85, S({ color: 0x8a2f3a, roughness: 1 }));
    mk(0.1, 2.3, 0.5, x - s * 0.1, 2.45, -0.15, S({ color: 0x8a2f3a, roughness: 1 }));
  }

  // ----- centre stage: the Gameboy on a lit pedestal, big wall screen behind -----
  cy(1.5, 1.6, 0.14, 0, 0.07, -3.9, black, 32);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.035, 8, 48), led(0x9bbc0f));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.15, -3.9);
  g.add(ring);
  cy(0.3, 0.42, 1.05, 0, 0.66, -3.9, S({ color: 0x2a2a30, metalness: 0.7, roughness: 0.3 }));
  cy(0.5, 0.3, 0.08, 0, 1.2, -3.9, S({ color: 0x2a2a30, metalness: 0.7, roughness: 0.3 }));
  const gb = new THREE.Group();
  const gbS = S({ color: 0xc8261c, roughness: 0.35 });
  const gbK = S({ color: 0xe9dfc8, roughness: 0.5 });
  const addGb = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const b = new THREE.Mesh(geo, m);
    b.position.set(x, y, z);
    b.rotation.set(rx, 0, rz);
    gb.add(b);
  };
  addGb(new THREE.BoxGeometry(0.66, 1.06, 0.16), gbS, 0, 0, 0);
  addGb(new THREE.BoxGeometry(0.54, 0.48, 0.02), S({ color: 0x3a3a40 }), 0, 0.2, 0.082);
  addGb(new THREE.PlaneGeometry(0.42, 0.36), led(0x9bbc0f, 1.4), 0, 0.2, 0.094);
  addGb(new THREE.BoxGeometry(0.17, 0.055, 0.03), black, -0.15, -0.2, 0.09);
  addGb(new THREE.BoxGeometry(0.055, 0.17, 0.03), black, -0.15, -0.2, 0.09);
  addGb(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), gbK, 0.2, -0.16, 0.09, Math.PI / 2);
  addGb(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), gbK, 0.08, -0.24, 0.09, Math.PI / 2);
  addGb(new THREE.BoxGeometry(0.1, 0.025, 0.02), black, -0.06, -0.4, 0.085, 0, -0.4);
  addGb(new THREE.BoxGeometry(0.1, 0.025, 0.02), black, 0.08, -0.4, 0.085, 0, -0.4);
  gb.scale.setScalar(1.25);
  gb.position.set(0, 2.05, -3.9);
  g.add(gb);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.3, 2.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe89a, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.set(0, 2.9, -3.9);
  g.add(beam);
  const gbGlow = new THREE.PointLight(0xc8e870, 9, 7, 1.8);
  gbGlow.position.set(0, 2.6, -3.2);
  g.add(gbGlow);
  // wall screen
  mk(4.5, 2.5, 0.16, 0, 2.85, -D / 2 + 0.1, black);
  plane(4.2, 2.2, 0, 2.85, -D / 2 + 0.19, canvasMat(512, 268, (c) => {
    c.fillStyle = "#9bbc0f";
    c.fillRect(0, 0, 512, 268);
    c.fillStyle = "#8bac0f";
    for (let y = 0; y < 268; y += 4) c.fillRect(0, y, 512, 2);
    c.fillStyle = "#0f380f";
    c.textAlign = "center";
    c.font = "64px 'Press Start 2P', monospace";
    c.fillText("NULLS", 256, 120);
    c.font = "17px 'Press Start 2P', monospace";
    c.fillStyle = "#306230";
    c.fillText("INSERT MEMORY CARD", 256, 170);
    c.fillText("▼", 256, 215);
  }, 1.2));
  for (const s of [-1, 1]) {
    mk(0.7, 1.7, 0.6, s * 2.9, 0.85, -D / 2 + 0.4, black);
    cy(0.22, 0.22, 0.03, s * 2.9, 1.25, -D / 2 + 0.71, S({ color: 0x3a3a40 })).rotation.x = Math.PI / 2;
    cy(0.14, 0.14, 0.03, s * 2.9, 0.6, -D / 2 + 0.71, S({ color: 0x3a3a40 })).rotation.x = Math.PI / 2;
    col(s * 2.9 - 0.4, s * 2.9 + 0.4, -D / 2, -D / 2 + 0.75, 1.7);
  }
  col(-0.55, 0.55, -4.45, -3.35, 1.3);

  // ----- memory card showcase (left of the screen) -----
  const SX = -5.6;
  mk(4.4, 1.9, 0.14, SX, 2.1, -D / 2 + 0.08, dark);
  mk(4.6, 0.1, 0.5, SX, 1.12, -D / 2 + 0.25, wood);
  mk(4.6, 0.1, 0.4, SX, 3.1, -D / 2 + 0.2, wood);
  mk(4.3, 0.04, 0.04, SX, 3.03, -D / 2 + 0.36, led(0xffd9a0, 2));
  CARDS.forEach((c, i) => {
    // empty slot: a dark outline of the card that is still missing
    mk(0.4, 0.5, 0.02, SX - 1.8 + i * 1.2, 2.0, -D / 2 + 0.17, S({ color: 0x1a120c }));
    mk(0.5, 0.06, 0.03, SX - 1.8 + i * 1.2, 1.55, -D / 2 + 0.17, led(new THREE.Color(c.color).getHex(), 1.2));
  });
  plane(3.2, 0.5, SX, 3.5, -D / 2 + 0.02, new THREE.MeshBasicMaterial({ map: textTex("DO NOT ERASE", "#7dff9a", "rgba(0,0,0,0)", 640, 100, "bold 44px 'Press Start 2P', monospace"), transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  const shelf = new THREE.Group();
  shelf.position.set(SX, 1.75, -D / 2 + 0.3);
  g.add(shelf);
  // drawer unit under the showcase
  mk(4.4, 0.9, 0.7, SX, 0.45, -D / 2 + 0.36, wood);
  for (const k of [-1.45, 0, 1.45]) mk(1.3, 0.3, 0.03, SX + k, 0.5, -D / 2 + 0.72, dark);
  col(SX - 2.3, SX + 2.3, -D / 2, -D / 2 + 0.75, 1.15);

  // ----- arcade cabinet and vending machine (right of the screen) -----
  const AX = 4.4;
  const cab = S({ color: 0x4a2a8a, roughness: 0.5 });
  mk(1.1, 2.1, 1, AX, 1.05, -D / 2 + 0.55, cab);
  mk(1.1, 0.5, 0.5, AX, 2.3, -D / 2 + 0.35, cab);
  mk(0.96, 0.32, 0.04, AX, 2.3, -D / 2 + 0.62, canvasMat(256, 80, (c) => {
    c.fillStyle = "#ff4fa3";
    c.fillRect(0, 0, 256, 80);
    c.fillStyle = "#fff";
    c.font = "26px 'Press Start 2P', monospace";
    c.textAlign = "center";
    c.fillText("NULL RUN", 128, 52);
  }, 1.4));
  const scr = plane(0.86, 0.7, AX, 1.62, -D / 2 + 1.07, canvasMat(128, 104, (c) => {
    c.fillStyle = "#0b1030";
    c.fillRect(0, 0, 128, 104);
    c.fillStyle = "#3fd6ff";
    for (let k = 0; k < 8; k++) c.fillRect(8 + k * 14, 14, 10, 6);
    c.fillStyle = "#ffb02e";
    c.fillRect(56, 84, 16, 8);
    c.fillStyle = "#fff";
    c.fillRect(63, 60, 2, 8);
  }, 1.5));
  scr.rotation.x = -0.25;
  mk(1.1, 0.12, 0.5, AX, 1.12, -D / 2 + 1.15, black);
  cy(0.03, 0.03, 0.16, AX - 0.25, 1.26, -D / 2 + 1.15, black);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), S({ color: 0xc8261c }));
  knob.position.set(AX - 0.25, 1.36, -D / 2 + 1.15);
  g.add(knob);
  for (const k of [0.05, 0.2, 0.35]) cy(0.04, 0.04, 0.03, AX + k, 1.19, -D / 2 + 1.15, led(0xffd23a, 1.2), 12);
  col(AX - 0.6, AX + 0.6, -D / 2, -D / 2 + 1.45, 2.1);
  const VX = 6.4;
  mk(1.4, 2.5, 0.95, VX, 1.25, -D / 2 + 0.5, S({ color: 0xc8261c, roughness: 0.4, metalness: 0.3 }));
  plane(0.9, 1.4, VX - 0.16, 1.55, -D / 2 + 0.99, canvasMat(128, 200, (c) => {
    c.fillStyle = "#cdeffc";
    c.fillRect(0, 0, 128, 200);
    for (let r = 0; r < 4; r++) {
      c.fillStyle = "#8aa";
      c.fillRect(0, 46 + r * 50, 128, 4);
      for (let k = 0; k < 4; k++) {
        c.fillStyle = ["#9b4dff", "#ff7a1a", "#2fd27a", "#2f7bff"][(k + r) % 4];
        c.fillRect(10 + k * 30, 12 + r * 50, 18, 32);
      }
    }
  }, 1.3));
  mk(0.95, 0.28, 0.05, VX - 0.16, 0.42, -D / 2 + 0.98, black);
  mk(0.22, 0.6, 0.05, VX + 0.5, 1.5, -D / 2 + 0.98, black);
  plane(1.2, 0.3, VX, 2.3, -D / 2 + 0.99, new THREE.MeshBasicMaterial({ map: textTex("SHOP", "#ffe9a8", "#7a140e", 256, 64, "bold 38px 'Press Start 2P', monospace"), toneMapped: false }));
  col(VX - 0.75, VX + 0.75, -D / 2, -D / 2 + 1.05, 2.5);

  // ----- bedroom corner (left) -----
  const BX = -W / 2 + 1.35,
    BZ = 2.9;
  mk(2.3, 0.4, 3.7, BX, 0.3, BZ, dark);
  mk(2.1, 0.28, 3.4, BX, 0.62, BZ, S({ color: 0xf0ece2, roughness: 1 }));
  mk(2.16, 0.14, 2.3, BX, 0.76, BZ + 0.55, S({ color: 0x4a2be0, roughness: 1 }));
  mk(2.18, 0.15, 0.3, BX, 0.765, BZ - 0.55, S({ color: 0x9b7bff, roughness: 1 }));
  mk(1.5, 0.2, 0.6, BX, 0.85, BZ - 1.3, S({ color: 0xffffff, roughness: 1 }));
  mk(2.3, 1.3, 0.14, BX, 0.85, BZ - 1.86, dark);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mk(0.12, 0.2, 0.12, BX + a * 1.05, 0.1, BZ + b * 1.75, dark);
  col(-W / 2, -W / 2 + 2.55, BZ - 1.95, BZ + 1.9, 0.82);
  // nightstand with a lamp
  mk(0.7, 0.6, 0.6, -W / 2 + 0.5, 0.3, 0.45, wood);
  cy(0.04, 0.1, 0.4, -W / 2 + 0.5, 0.8, 0.45, black);
  cy(0.14, 0.24, 0.3, -W / 2 + 0.5, 1.1, 0.45, led(0xffd9a0, 1.6));
  col(-W / 2, -W / 2 + 0.9, 0.1, 0.8, 0.6);

  // ----- wardrobe with a mirror (right) -----
  const WZ = 2.9;
  mk(1.1, 3.1, 2.8, W / 2 - 0.6, 1.55, WZ, wood);
  mk(0.04, 2.9, 0.04, W / 2 - 1.16, 1.55, WZ, dark);
  for (const s of [-1, 1]) cy(0.03, 0.03, 0.3, W / 2 - 1.18, 1.5, WZ + s * 0.12, S({ color: 0xd8b23a, metalness: 1, roughness: 0.3 }), 8);
  plane(0.9, 2.2, W / 2 - 1.17, 1.6, WZ - 0.75, S({ color: 0xbfe0f4, metalness: 1, roughness: 0.05 }), -Math.PI / 2);
  col(W / 2 - 1.2, W / 2, WZ - 1.45, WZ + 1.45, 3.1);

  // ----- lounge: rug, bean bags, sofa, bookshelf, plants -----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.7, 40), canvasMat(256, 256, (c) => {
    for (const [r, col2] of [[128, "#3a1a6a"], [112, "#9b4dff"], [92, "#3a1a6a"], [84, "#ff7a1a"], [72, "#2a124e"]] as [number, string][]) {
      c.fillStyle = col2;
      c.beginPath();
      c.arc(128, 128, r, 0, 7);
      c.fill();
    }
    c.fillStyle = "#f3ead6";
    c.font = "italic 900 96px Inter, sans-serif";
    c.textAlign = "center";
    c.fillText("n", 128, 158);
  }, 0.75));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 0.2);
  g.add(rug);
  for (const [x, cl] of [[-2.9, 0xff7a1a], [2.9, 0x2fd27a]] as [number, number][]) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), S({ color: cl, roughness: 1 }));
    bag.scale.set(1, 0.6, 1);
    bag.position.set(x, 0.4, -1.3);
    g.add(bag);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), S({ color: cl, roughness: 1 }));
    top.scale.set(1, 0.7, 0.6);
    top.position.set(x, 0.75, -1.65);
    g.add(top);
    col(x - 0.6, x + 0.6, -1.9, -0.7, 0.7);
  }
  const sofa = S({ color: 0x2f5a8a, roughness: 1 });
  mk(3.2, 0.5, 1.1, 4.6, 0.35, D / 2 - 0.75, sofa);
  mk(3.2, 0.8, 0.3, 4.6, 0.95, D / 2 - 0.3, sofa);
  for (const s of [-1, 1]) mk(0.3, 0.75, 1.1, 4.6 + s * 1.6, 0.6, D / 2 - 0.75, sofa);
  for (const k of [-0.75, 0.75]) mk(1.35, 0.14, 0.9, 4.6 + k, 0.66, D / 2 - 0.8, S({ color: 0x3f6fa6, roughness: 1 }));
  mk(0.6, 0.5, 0.2, 3.7, 0.95, D / 2 - 0.6, S({ color: 0xffb02e, roughness: 1 }), 0.3);
  col(2.85, 6.35, D / 2 - 1.35, D / 2, 0.75);
  // bookshelf
  const KX = -4.4;
  mk(3, 2.7, 0.5, KX, 1.35, D / 2 - 0.3, dark);
  const bookCols = [0xc8261c, 0x2f7bff, 0xffb02e, 0x2fd27a, 0x9b4dff, 0xf3ead6, 0x1f3a5a];
  for (let r = 0; r < 4; r++) {
    mk(2.8, 0.05, 0.46, KX, 0.35 + r * 0.62, D / 2 - 0.34, wood);
    let x = KX - 1.3;
    let k = r * 3;
    while (x < KX + 1.2) {
      const bw = 0.08 + ((k * 7) % 5) * 0.02,
        bh = 0.36 + ((k * 3) % 4) * 0.04;
      if ((k + r) % 9 !== 0) mk(bw, bh, 0.3, x + bw / 2, 0.38 + r * 0.62 + bh / 2, D / 2 - 0.42, S({ color: bookCols[k % bookCols.length], roughness: 0.9 }));
      x += bw + 0.012;
      k++;
    }
  }
  col(KX - 1.5, KX + 1.5, D / 2 - 0.6, D / 2, 2.7);
  // plants
  const leaf = S({ color: 0x2f7a3a, roughness: 1 });
  for (const [x, z] of [[-7.2, -1.6], [7.2, -5.2], [2, D / 2 - 0.6], [-7.3, 5.4]]) {
    cy(0.28, 0.2, 0.45, x, 0.225, z, S({ color: 0xb8623a, roughness: 1 }));
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), leaf);
      l.position.set(x + Math.cos(k * 1.3) * 0.2, 0.75 + k * 0.17, z + Math.sin(k * 1.3) * 0.2);
      l.scale.set(1, 1.3, 1);
      g.add(l);
    }
    col(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 1.2);
  }

  // ----- posters of the four Nulls, from the original artwork -----
  const loader = new THREE.TextureLoader();
  const poster = (id: string, x: number, y: number, z: number, ry: number) => {
    const t = loader.load(`/art/${id}.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    const p = plane(1.15, 2.06, x, y, z, new THREE.MeshBasicMaterial({ map: t }), ry);
    const f = mk(1.27, 2.18, 0.05, x, y, z, black, ry);
    f.translateZ(-0.03);
    return p;
  };
  poster("rhea", -W / 2 + 0.07, 2.55, 2.1, Math.PI / 2);
  poster("noir", -W / 2 + 0.07, 2.55, 3.7, Math.PI / 2);
  poster("meteora", W / 2 - 0.07, 2.55, 5.1, -Math.PI / 2);
  poster("naxweb3", 4.6, 2.75, D / 2 - 0.07, Math.PI);
  plane(2.6, 0.5, -4.4, 3.4, D / 2 - 0.05, new THREE.MeshBasicMaterial({ map: textTex("PLAYER SELECT", "#ff5fb0", "rgba(0,0,0,0)", 640, 110, "bold 42px 'Press Start 2P', monospace"), transparent: true, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) }), Math.PI);

  // ----- lights: ceiling lamp, LED strips -----
  cy(0.02, 0.02, 0.7, 0, H - 0.35, 0.2, black, 6);
  cy(0.5, 0.75, 0.35, 0, H - 0.85, 0.2, S({ color: 0x2a2a30, metalness: 0.5 }));
  cy(0.45, 0.45, 0.04, 0, H - 1.03, 0.2, led(0xffe6c0, 2.2));
  const lamp = new THREE.PointLight(0xffd9a8, 34, 22, 1.5);
  lamp.position.set(0, H - 1.2, 0.2);
  g.add(lamp);
  mk(W - 0.3, 0.05, 0.05, 0, H - 0.05, -D / 2 + 0.08, led(0xff3fa4));
  mk(0.05, 0.05, D - 0.3, -W / 2 + 0.08, H - 0.05, 0, led(0x3fd6ff));
  mk(0.05, 0.05, D - 0.3, W / 2 - 0.08, H - 0.05, 0, led(0x3fd6ff));

  // walls
  col(-W / 2 - 1, W / 2 + 1, -D / 2 - 1, -D / 2 + 0.1, 9);
  col(-W / 2 - 1, -W / 2 + 0.1, -D / 2, D / 2, 9);
  col(W / 2 - 0.1, W / 2 + 1, -D / 2, D / 2, 9);
  col(-W / 2, -1.1, D / 2 - 0.1, D / 2 + 1, 9);
  col(1.1, W / 2, D / 2 - 0.1, D / 2 + 1, 9);
  col(-1.1, 1.1, D / 2 + 0.35, D / 2 + 1.5, 9);

  // merge the static furniture into a few meshes
  bake(g, new Set(), null, new Set<THREE.Object3D>([gb, shelf, beam, rug]), true);
  g.position.copy(O);

  return {
    group: g,
    colliders,
    spawn: new THREE.Vector3(O.x, 0, O.z + D / 2 - 1.3),
    spots: [
      { id: "gameboy", x: O.x, z: O.z - 2.5, label: "PLAY GAMEBOY" },
      { id: "bed", x: O.x - W / 2 + 3.2, z: O.z + BZ, label: "SLEEP: NEW HUNT" },
      { id: "wardrobe", x: O.x + W / 2 - 1.9, z: O.z + WZ, label: "CHANGE PLAYER" },
      { id: "door", x: O.x, z: O.z + D / 2 - 0.5, label: "GO OUTSIDE" },
      { id: "shop", x: O.x + VX, z: O.z - D / 2 + 1.75, label: "VENDING MACHINE" },
    ],
    shelf,
    bounds: { hx: W / 2 - 0.35, hz: D / 2 - 0.35, h: H - 0.35 },
    tick(t) {
      gb.rotation.y = Math.sin(t * 0.8) * 0.5;
      gb.position.y = 2.05 + Math.sin(t * 1.6) * 0.06;
    },
  };
}
