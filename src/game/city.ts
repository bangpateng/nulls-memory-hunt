// The city of Nulls, built to look like a PS2-era open world: a 5 x 5 grid of blocks with textured
// apartment, brick, concrete and glass buildings over shopfronts, sidewalks with curbs, street lamps,
// traffic lights, trees, hydrants, benches, bus stops, parking lots, a park, the station and the
// Game House in the middle. Also the colliders, the box spots, parking spots and walking loops.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "./data";
import { bake } from "./bake";
import { asphalt, curbTex, facade, FACADES, grass, gravel, shopfront, sidewalk, woodTex, rep, type FacadeStyle } from "./textures";

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  tall?: boolean; // blocks the camera
}

export interface BoxSpot {
  x: number;
  y: number; // height of the surface it sits on
  z: number;
  rot: number;
  roof?: boolean;
}

export const BLOCK = 24;
export const ROAD = 10;
export const STEP = BLOCK + ROAD;
export const START = -80; // west / north edge of block 0
export const SW = 0.15; // sidewalk height
export const blockMin = (i: number) => START + i * STEP;
export const ROAD_CENTERS = [0, 1, 2, 3].map((i) => blockMin(i) + BLOCK + ROAD / 2); // -51, -17, 17, 51
export const LIMIT = 92;
export const HOUSE_DOOR = { x: 0, z: 5.2 };
export const LANE = 1.9; // traffic lane offset from the road centre
export const PARK_LANE = 4.05; // parked cars

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const textTex = (text: string, color: string, bg = "rgba(0,0,0,0)", w = 512, h = 128, font = "bold 72px 'Press Start 2P', monospace") =>
  canvasTex(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = color;
    c.shadowBlur = 18;
    c.fillStyle = color;
    c.fillText(text, w / 2, h / 2 + 4);
  });

export type Signal = "green" | "yellow" | "red";
/** Traffic light cycle shared by the city and the cars: x roads go first, then z roads. */
export function signalFor(axis: "x" | "z", t: number): Signal {
  const p = t % 18;
  if (axis === "x") return p < 7.5 ? "green" : p < 9 ? "yellow" : "red";
  return p >= 9 && p < 16.5 ? "green" : p >= 16.5 ? "yellow" : "red";
}

export interface City {
  group: THREE.Group;
  colliders: Collider[];
  spots: BoxSpot[];
  npcSpots: { x: number; z: number; face: number }[];
  parkSpots: { x: number; z: number; rot: number }[];
  walkLoops: [number, number, number, number][]; // minX, minZ, maxX, maxZ rectangles
  map: HTMLCanvasElement; // minimap base image
  mapScale: (x: number, z: number) => [number, number];
  tick: (t: number) => void;
  setEnv: (night: number, wet: number) => void;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });

/** Scale the UVs of a box so textures keep their real-world size (tile = tw x th metres). */
function boxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number, tw: number, th: number, roofTile = 2.5) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      let u = uv.getX(i),
        v = uv.getY(i);
      if (f === 0 || f === 1) (u *= d / tw), (v *= h / th);
      else if (f === 4 || f === 5) (u *= w / tw), (v *= h / th);
      else (u *= w / roofTile), (v *= d / roofTile);
      uv.setXY(i, u, v);
    }
  return geo;
}

const NEON = [
  ["HOTEL", "#ff4f6a"],
  ["BAR", "#3fd6ff"],
  ["NULLS", "#b07bff"],
  ["OPEN", "#ff7a1a"],
  ["CAFE", "#2fd27a"],
  ["MOTEL", "#ffd23a"],
];

export function buildCity(): City {
  const g = new THREE.Group();
  const colliders: Collider[] = [];
  const spots: BoxSpot[] = [];
  const parkSpots: City["parkSpots"] = [];
  const walkLoops: City["walkLoops"] = [];
  const r = rng(20261117);

  // things that react to day/night and rain
  const nightEmissive: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  const nightBasic: { m: THREE.MeshBasicMaterial; day: number; night: number; base: THREE.Color }[] = [];
  const glow = (color: number, day: number, night: number) => {
    const base = new THREE.Color(color);
    const m = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(day), toneMapped: false });
    nightBasic.push({ m, day, night, base });
    return m;
  };

  // ---------- merged geometry buckets ----------
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, geo: THREE.BufferGeometry) => {
    let l = buckets.get(m);
    if (!l) buckets.set(m, (l = []));
    l.push(geo);
  };
  const box = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) => {
    const b = new THREE.BoxGeometry(w, h, d);
    if (ry) b.rotateY(ry);
    b.translate(x, y, z);
    put(m, b);
  };
  const cyl = (m: THREE.Material, x: number, y: number, z: number, rt: number, rb: number, h: number, seg = 10) => {
    const c = new THREE.CylinderGeometry(rt, rb, h, seg);
    c.translate(x, y, z);
    put(m, c);
  };

  // ---------- materials ----------
  const metal = std({ color: 0x2c2f33, metalness: 0.7, roughness: 0.4 });
  const steel = std({ color: 0x8a8f96, metalness: 0.8, roughness: 0.35 });
  const concrete = std({ color: 0x9c978e, roughness: 0.95 });
  const darkConcrete = std({ color: 0x5c5853, roughness: 0.95 });
  const hydrantRed = std({ color: 0xb3261e, roughness: 0.5 });
  const binGreen = std({ color: 0x2f5d3a, roughness: 0.6, metalness: 0.3 });
  const mailBlue = std({ color: 0x1f4fa0, roughness: 0.5, metalness: 0.3 });
  const wood = std({ map: rep(woodTex(), 1, 1), roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25 });
  const trunk = std({ color: 0x4a3828, roughness: 1 });
  const leaves = [std({ color: 0x3d6b2a }), std({ color: 0x4f7a30 }), std({ color: 0x2f5a2a })];
  const roofMat = std({ map: gravel(), roughness: 1 });
  const lampHead = glow(0xffe2a8, 0.25, 3);
  const pools: THREE.BufferGeometry[] = [];

  // ---------- ground ----------
  const roadMat = std({ map: rep(asphalt(), 30, 30), roughness: 0.95, metalness: 0 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  g.add(road);

  // road markings: double yellow centre, white edge lines, stop lines, zebra crossings
  const yellow = std({ color: 0xd8b23a, roughness: 0.7 });
  const white = std({ color: 0xe4e4e0, roughness: 0.7 });
  for (const rc of ROAD_CENTERS)
    for (let j = 0; j < 5; j++) {
      const a = blockMin(j) + 2.6,
        b = blockMin(j) + BLOCK - 2.6,
        mid = (a + b) / 2,
        len = b - a;
      for (const s of [-0.13, 0.13]) {
        box(yellow, rc + s, 0.012, mid, 0.1, 0.01, len);
        box(yellow, mid, 0.012, rc + s, len, 0.01, 0.1);
      }
      for (const s of [-4.55, 4.55]) {
        box(white, rc + s, 0.012, mid, 0.12, 0.01, len);
        box(white, mid, 0.012, rc + s, len, 0.01, 0.12);
      }
      // dashed lane dividers between the centre and the parking lane
      for (let z = a; z < b - 1; z += 4)
        for (const s of [-3.05, 3.05]) {
          box(white, rc + s, 0.012, z + 1, 0.1, 0.01, 1.8);
          box(white, z + 1, 0.012, rc + s, 1.8, 0.01, 0.1);
        }
    }
  for (const rx of ROAD_CENTERS)
    for (const rz of ROAD_CENTERS)
      for (const side of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          box(white, rx + k * 1.3, 0.013, rz + side * 6.3, 0.65, 0.01, 2.2);
          box(white, rx + side * 6.3, 0.013, rz + k * 1.3, 2.2, 0.01, 0.65);
        }
        // stop lines on the right-hand lanes
        box(white, rx - side * 2.3, 0.013, rz - side * 7.7, 4.4, 0.01, 0.35);
        box(white, rx - side * 7.7, 0.013, rz + side * 2.3, 0.35, 0.01, 4.4);
      }
  // manholes
  const manhole = std({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 });
  for (const rc of ROAD_CENTERS) for (let j = 0; j < 5; j++) cyl(manhole, rc + 1.9, 0.012, blockMin(j) + 8, 0.45, 0.45, 0.02, 16);

  // ---------- shared building materials ----------
  const facadeMats = new Map<string, THREE.MeshStandardMaterial>();
  const facadeMat = (style: FacadeStyle, v: number) => {
    const k = `${style}${v}`;
    let m = facadeMats.get(k);
    if (!m) {
      const f = facade(style, v);
      m = std({ map: f.map, emissiveMap: f.lit, emissive: 0xffffff, emissiveIntensity: 0, roughness: style === "glass" ? 0.18 : 0.88, metalness: style === "glass" ? 0.55 : 0 });
      nightEmissive.push({ m, k: 0.95 });
      facadeMats.set(k, m);
    }
    return m;
  };
  const shopMats = Array.from({ length: 10 }, (_, i) => {
    const f = shopfront(i);
    const m = std({ map: f.map, emissiveMap: f.lit, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.6 });
    nightEmissive.push({ m, k: 0.9 });
    return m;
  });
  const cornice = std({ color: 0xb8b2a6, roughness: 0.9 });

  const awningMats = [0xb3261e, 0x1f6b3a, 0x1f4fa0, 0xd9a21e, 0x5a2a6b, 0x2a2a2e].map((c) => std({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  const slant = (m: THREE.Material, x: number, y: number, z: number, w: number, d: number, rx: number, rz: number) => {
    const b = new THREE.BoxGeometry(w, 0.07, d);
    if (rx) b.rotateX(rx);
    if (rz) b.rotateZ(rz);
    b.translate(x, y, z);
    put(m, b);
  };
  const ADS: [string, string, string, string][] = [
    ["NULLS", "MEMORY HUNT", "#1b1030", "#ffb02e"],
    ["DO NOT ERASE", "KEEP YOUR MEMORIES", "#f3ead6", "#c8261c"],
    ["GAME HOUSE", "PLAY THE CLASSICS", "#0f380f", "#9bbc0f"],
    ["COMING TO NEAR", "THE WORLD OF NULLS", "#123c5a", "#ffffff"],
  ];
  let roofAds = 0;
  const adCache = new Map<string, THREE.MeshStandardMaterial>();
  const adMat = (ad: [string, string, string, string]) => {
    let m = adCache.get(ad[0]);
    if (!m) {
      const t = canvasTex(512, 222, (c) => {
        c.fillStyle = ad[2];
        c.fillRect(0, 0, 512, 222);
        c.fillStyle = ad[3];
        c.textAlign = "center";
        c.font = "900 64px Inter, Arial, sans-serif";
        c.fillText(ad[0], 256, 110);
        c.font = "700 26px Inter, Arial, sans-serif";
        c.fillText(ad[1], 256, 160);
        c.strokeStyle = ad[3];
        c.lineWidth = 8;
        c.strokeRect(14, 14, 484, 194);
      });
      m = std({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.7 });
      nightEmissive.push({ m, k: 0.7 });
      adCache.set(ad[0], m);
    }
    return m;
  };
  const neonSigns: THREE.Mesh[] = [];
  const billboards: { x: number; y: number; z: number; w: number; h: number; ry: number }[] = [];

  const addBuilding = (x0: number, z0: number, w: number, d: number, floors: number, opts: { shopFace?: number; style?: FacadeStyle; fx?: number; fz?: number } = {}) => {
    const shopH = 4;
    const h = shopH + floors * 3.5;
    const style = opts.style ?? FACADES[Math.floor(r() * FACADES.length)];
    const mat = facadeMat(style, Math.floor(r() * 2));
    const cx = x0 + w / 2,
      cz = z0 + d / 2;
    if (floors > 0) {
      const geo = boxUV(new THREE.BoxGeometry(w, h - shopH, d), w, h - shopH, d, 10, 14);
      const b = new THREE.Mesh(geo, [mat, mat, roofMat, mat, mat, mat]);
      b.position.set(cx, shopH + (h - shopH) / 2, cz);
      b.castShadow = b.receiveShadow = true;
      g.add(b);
    }
    // ground floor shops
    const shop = shopMats[(opts.shopFace ?? Math.floor(r() * shopMats.length)) % shopMats.length];
    const sgeo = boxUV(new THREE.BoxGeometry(w, shopH, d), w, shopH, d, 10, 4);
    const s = new THREE.Mesh(sgeo, [shop, shop, floors > 0 ? concrete : roofMat, shop, shop, shop]);
    s.position.set(cx, SW + shopH / 2 - 0.1, cz);
    s.castShadow = s.receiveShadow = true;
    g.add(s);
    // cornice and parapet
    box(cornice, cx, h + 0.15, cz, w + 0.5, 0.3, d + 0.5);
    for (const [px, pz, pw, pd] of [
      [cx, z0 + 0.1, w, 0.2],
      [cx, z0 + d - 0.1, w, 0.2],
      [x0 + 0.1, cz, 0.2, d],
      [x0 + w - 0.1, cz, 0.2, d],
    ])
      box(concrete, px, h + 0.6, pz, pw, 0.6, pd);
    box(darkConcrete, cx, shopH + 0.05, cz, w + 0.3, 0.25, d + 0.3);
    colliders.push({ minX: x0, maxX: x0 + w, minZ: z0, maxZ: z0 + d, top: h + 0.3, tall: h > 5 });
    // ----- real 3D relief on the facade -----
    const fx = opts.fx ?? 1,
      fz = opts.fz ?? 1;
    const aw = awningMats[Math.floor(r() * awningMats.length)];
    const zf = fz > 0 ? z0 + d : z0,
      xf = fx > 0 ? x0 + w : x0;
    slant(aw, cx, SW + 3.02, zf + fz * 0.62, w - 0.5, 1.3, fz * 0.3, 0);
    slant(aw, xf + fx * 0.62, SW + 3.02, cz, 1.3, d - 0.5, 0, -fx * 0.3);
    if (style !== "glass") {
      for (const [px, pz] of [
        [x0, z0],
        [x0 + w, z0],
        [x0, z0 + d],
        [x0 + w, z0 + d],
      ])
        if (floors > 0) box(cornice, px, (shopH + h) / 2, pz, 0.4, h - shopH, 0.4);
      for (let f = 1; f < floors; f++) box(cornice, cx, shopH + f * 3.5, cz, w + 0.22, 0.14, d + 0.22);
    } else for (let f = 1; f < floors; f++) box(metal, cx, shopH + f * 3.5, cz, w + 0.1, 0.1, d + 0.1);
    // balconies with railings on the street side
    if ((style === "stucco" || style === "brick") && floors >= 2 && r() < 0.7) {
      const col = r() < 0.5 ? 2.2 : w - 2.2;
      for (let f = 0; f < floors; f++) {
        const by = shopH + f * 3.5 + 0.75;
        box(concrete, x0 + col, by, zf + fz * 0.5, 2.4, 0.12, 1);
        box(metal, x0 + col, by + 0.95, zf + fz * 0.97, 2.4, 0.06, 0.06);
        for (const e of [-1.17, -0.4, 0.4, 1.17]) box(metal, x0 + col + e, by + 0.5, zf + fz * 0.97, 0.05, 0.9, 0.05);
        if (r() < 0.4) box(binGreen, x0 + col + 0.7, by + 0.3, zf + fz * 0.6, 0.4, 0.45, 0.4);
      }
    }
    // fire escape on the brick ones, on the side street
    if ((style === "darkbrick" || style === "concrete") && floors >= 3 && r() < 0.6) {
      for (let f = 1; f < floors; f++) {
        const by = shopH + f * 3.5 + 0.7;
        box(metal, xf + fx * 0.55, by, cz, 1.1, 0.07, 3.4);
        box(metal, xf + fx * 1.08, by + 0.9, cz, 0.05, 0.05, 3.4);
        for (const e of [-1.7, 0, 1.7]) box(metal, xf + fx * 1.08, by + 0.45, cz + e, 0.05, 0.9, 0.05);
        // ladder to the next landing
        const lad = new THREE.BoxGeometry(0.5, 3.6, 0.06);
        lad.rotateX(0.38);
        lad.translate(xf + fx * 0.6, by - 1.75, cz + (f % 2 ? 0.9 : -0.9));
        put(metal, lad);
      }
    }
    // a narrower top tier on the towers
    let tier = false;
    if (floors >= 6 && r() < 0.65) {
      tier = true;
      const th = 7;
      const tg = boxUV(new THREE.BoxGeometry(w - 3, th, d - 3), w - 3, th, d - 3, 10, 14);
      const tm = new THREE.Mesh(tg, [mat, mat, roofMat, mat, mat, mat]);
      tm.position.set(cx, h + th / 2, cz);
      g.add(tm);
      box(cornice, cx, h + th + 0.12, cz, w - 2.6, 0.24, d - 2.6);
      box(metal, cx, h + th + 2.2, cz, 0.12, 4, 0.12);
      colliders.push({ minX: x0 + 1.5, maxX: x0 + w - 1.5, minZ: z0 + 1.5, maxZ: z0 + d - 1.5, top: h + th + 0.24, tall: true });
    }
    // billboard on the roof of the low-rise ones
    if (floors >= 1 && floors <= 4 && roofAds < 7 && r() < 0.35) {
      const ad = ADS[roofAds++ % ADS.length];
      const bm = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.2), [metal, metal, metal, metal, adMat(ad), adMat(ad)]);
      bm.position.set(cx, h + 2.9, zf - fz * 0.8);
      g.add(bm);
      for (const e of [-2.2, 2.2]) box(metal, cx + e, h + 1, zf - fz * 0.8, 0.14, 1.6, 0.14);
    }
    // rooftop clutter
    if (floors > 0 && !tier) {
      box(steel, x0 + 1.5 + r() * (w - 3), h + 0.55, z0 + 1.5 + r() * (d - 3), 1.6, 0.9, 1.1);
      if (r() < 0.5) {
        const tx = x0 + 1.6 + r() * (w - 3.2),
          tz = z0 + 1.6 + r() * (d - 3.2);
        cyl(wood, tx, h + 2.2, tz, 0.9, 0.9, 1.8, 14);
        for (const [a, b] of [
          [-0.6, -0.6],
          [0.6, -0.6],
          [-0.6, 0.6],
          [0.6, 0.6],
        ])
          box(metal, tx + a, h + 0.7, tz + b, 0.1, 1.2, 0.1);
      }
      if (floors > 6 && r() < 0.5) box(metal, cx + (r() - 0.5) * 3, h + 2.2, cz + (r() - 0.5) * 3, 0.1, 3.6, 0.1);
    }
    // blade neon sign sticking out over the sidewalk
    if (floors >= 3 && r() < 0.35) {
      const [txt, col] = NEON[Math.floor(r() * NEON.length)];
      const frame = glow(0x222222, 1, 1);
      const face = new THREE.MeshBasicMaterial({ map: verticalText(txt, col), toneMapped: false });
      nightBasic.push({ m: face, day: 0.7, night: 1.8, base: new THREE.Color(1, 1, 1) });
      const sg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 1), [face, face, frame, frame, frame, frame]);
      sg.position.set(r() < 0.5 ? x0 + 1 : x0 + w - 1, shopH + 2.6, z0 + d + 0.5);
      g.add(sg);
      neonSigns.push(sg);
    }
    if (floors >= 6 && billboards.length < 8 && r() < 0.45) {
      const bw = Math.min(w - 1, 7),
        bh = bw * 0.56;
      if (r() < 0.5) billboards.push({ x: cx, y: h - bh / 2 - 2.5, z: z0 + d + 0.08, w: bw, h: bh, ry: 0 });
      else billboards.push({ x: x0 - 0.08, y: h - bh / 2 - 2.5, z: cz, w: bw, h: bh, ry: -Math.PI / 2 });
    }
    return h;
  };

  // ---------- street furniture ----------
  const lamp = (x: number, z: number, dx: number, dz: number) => {
    cyl(metal, x, SW + 3.2, z, 0.07, 0.11, 6.4, 8);
    box(metal, x + dx * 0.9, SW + 6.35, z + dz * 0.9, 0.12 + Math.abs(dx) * 1.7, 0.1, 0.12 + Math.abs(dz) * 1.7);
    box(metal, x + dx * 1.7, SW + 6.25, z + dz * 1.7, 0.5, 0.18, 0.5);
    box(lampHead, x + dx * 1.7, SW + 6.14, z + dz * 1.7, 0.4, 0.05, 0.4);
    const pc = new THREE.CircleGeometry(3.8, 20);
    pc.rotateX(-Math.PI / 2);
    pc.translate(x + dx * 1.7, 0.03, z + dz * 1.7);
    pools.push(pc);
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, top: 6.5 });
  };
  const tree = (x: number, z: number, s = 1, onWalk = true) => {
    const y = SW;
    if (onWalk) box(darkConcrete, x, y + 0.01, z, 1.3, 0.04, 1.3);
    const t = new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 3 * s, 7);
    t.translate(x, y + 1.5 * s, z);
    put(trunk, t);
    const lm = leaves[Math.floor(r() * leaves.length)];
    for (let k = 0; k < 4; k++) {
      const ico = new THREE.IcosahedronGeometry((1.1 + r() * 0.6) * s, 1);
      ico.translate(x + (r() - 0.5) * 1.4 * s, y + (3 + r() * 1.3) * s, z + (r() - 0.5) * 1.4 * s);
      put(lm, ico);
    }
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, top: 5 * s });
  };
  const hydrant = (x: number, z: number) => {
    cyl(hydrantRed, x, SW + 0.35, z, 0.14, 0.17, 0.7, 10);
    cyl(hydrantRed, x, SW + 0.75, z, 0.08, 0.15, 0.12, 10);
    box(hydrantRed, x, SW + 0.45, z, 0.46, 0.1, 0.1);
    colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, top: SW + 0.82 });
  };
  const bin = (x: number, z: number) => {
    cyl(binGreen, x, SW + 0.5, z, 0.3, 0.27, 1, 12);
    cyl(metal, x, SW + 1.02, z, 0.32, 0.32, 0.06, 12);
    colliders.push({ minX: x - 0.32, maxX: x + 0.32, minZ: z - 0.32, maxZ: z + 0.32, top: SW + 1.05 });
  };
  const bench = (x: number, z: number, ry: number, y0 = SW) => {
    const SWb = y0;
    const ax = Math.abs(Math.sin(ry)) > 0.5;
    box(wood, x, SWb + 0.48, z, ax ? 0.5 : 1.9, 0.06, ax ? 1.9 : 0.5);
    const bx = ax ? Math.sign(Math.sin(ry)) * -0.22 : 0,
      bz = ax ? 0 : Math.sign(Math.cos(ry)) * -0.22;
    box(wood, x + bx, SWb + 0.8, z + bz, ax ? 0.06 : 1.9, 0.4, ax ? 1.9 : 0.06);
    for (const s of [-0.8, 0.8]) box(metal, x + (ax ? 0 : s), SWb + 0.24, z + (ax ? s : 0), ax ? 0.45 : 0.06, 0.48, ax ? 0.06 : 0.45);
    colliders.push({ minX: x - (ax ? 0.3 : 0.95), maxX: x + (ax ? 0.3 : 0.95), minZ: z - (ax ? 0.95 : 0.3), maxZ: z + (ax ? 0.95 : 0.3), top: SWb + 0.52 });
  };
  const busStop = (x: number, z: number, alongX: boolean, back: number) => {
    const L = 3.6,
      D = 1.4;
    const w = alongX ? L : D,
      d = alongX ? D : L;
    box(steel, x, SW + 2.5, z, w + 0.2, 0.1, d + 0.2);
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      box(steel, x + (a * w) / 2, SW + 1.25, z + (b * d) / 2, 0.08, 2.5, 0.08);
    if (alongX) box(glass, x, SW + 1.4, z + (back * d) / 2, w, 2, 0.04);
    else box(glass, x + (back * w) / 2, SW + 1.4, z, 0.04, 2, d);
    bench(x, z + (alongX ? (back * d) / 4 : 0), alongX ? 0 : Math.PI / 2);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.5), std({ color: 0x1e6fd9 }));
    sign.position.set(x + (alongX ? w / 2 + 0.2 : 0), SW + 2.6, z + (alongX ? 0 : d / 2 + 0.2));
    g.add(sign);
  };
  const mailbox = (x: number, z: number) => {
    box(mailBlue, x, SW + 0.55, z, 0.5, 0.8, 0.5);
    cyl(mailBlue, x, SW + 0.95, z, 0.25, 0.25, 0.5, 10);
    colliders.push({ minX: x - 0.28, maxX: x + 0.28, minZ: z - 0.28, maxZ: z + 0.28, top: SW + 1.2 });
  };
  const crate = (x: number, z: number, s: number, y = SW) => {
    box(wood, x, y + s / 2, z, s, s, s);
    colliders.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, top: y + s });
  };
  const dumpster = (x: number, z: number, rotated: boolean) => {
    const w = rotated ? 1.4 : 2.4,
      d = rotated ? 2.4 : 1.4;
    box(binGreen, x, SW + 0.7, z, w, 1.3, d);
    box(metal, x, SW + 1.4, z, w + 0.08, 0.1, d + 0.08);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: SW + 1.45 });
  };

  // traffic lights: a pole on every corner, one signal head for each road
  const sig = {
    x: { red: glow(0xff2a1a, 0.15, 0.15), yellow: glow(0xffb01a, 0.15, 0.15), green: glow(0x2aff7a, 0.15, 0.15) },
    z: { red: glow(0xff2a1a, 0.15, 0.15), yellow: glow(0xffb01a, 0.15, 0.15), green: glow(0x2aff7a, 0.15, 0.15) },
  };
  const signalHead = (x: number, z: number, faceX: number, faceZ: number, axis: "x" | "z") => {
    const w = Math.abs(faceX) > 0 ? 0.3 : 0.38,
      d = Math.abs(faceZ) > 0 ? 0.3 : 0.38;
    box(metal, x, SW + 4.3, z, w, 1.1, d);
    const cols: Signal[] = ["red", "yellow", "green"];
    cols.forEach((c, k) => {
      const s = new THREE.SphereGeometry(0.11, 8, 6);
      s.translate(x + faceX * 0.17, SW + 4.65 - k * 0.34, z + faceZ * 0.17);
      put(sig[axis][c], s);
    });
  };
  for (const rx of ROAD_CENTERS)
    for (const rz of ROAD_CENTERS)
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const x = rx + sx * 5.6,
          z = rz + sz * 5.6;
        cyl(metal, x, SW + 2.3, z, 0.08, 0.1, 4.6, 8);
        // head for z-traffic coming toward this corner, and for x-traffic
        signalHead(x, z + sz * 0.05, 0, sz, "z");
        signalHead(x + sx * 0.05, z, sx, 0, "x");
        colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, top: 5 });
      }

  // ---------- blocks ----------
  const sidewalkMat = std({ map: rep(sidewalk(), 5, 5), roughness: 0.9 });
  const curbMat = std({ map: rep(curbTex(), 6, 1), roughness: 0.9 });
  const lotAsphalt = std({ map: rep(asphalt(), 3, 3), roughness: 0.95 });
  const grassMat = std({ map: rep(grass(), 6, 6), roughness: 1 });
  const blockTypes = (i: number, j: number) => (i === 2 && j === 2 ? "house" : i === 1 && j === 2 ? "park" : i === 3 && j === 2 ? "station" : "city");
  let shopIdx = 0;

  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const x0 = blockMin(i),
        z0 = blockMin(j),
        x1 = x0 + BLOCK,
        z1 = z0 + BLOCK;
      const type = blockTypes(i, j);
      // sidewalk slab with a stone curb
      const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, SW, BLOCK), type === "park" ? [curbMat, curbMat, grassMat, curbMat, curbMat, curbMat] : sidewalkMat);
      slab.position.set(x0 + BLOCK / 2, SW / 2, z0 + BLOCK / 2);
      slab.receiveShadow = true;
      g.add(slab);
      for (const [cx, cz, w, d] of [
        [x0 + BLOCK / 2, z0 + 0.12, BLOCK, 0.25],
        [x0 + BLOCK / 2, z1 - 0.12, BLOCK, 0.25],
        [x0 + 0.12, z0 + BLOCK / 2, 0.25, BLOCK],
        [x1 - 0.12, z0 + BLOCK / 2, 0.25, BLOCK],
      ])
        box(curbMat, cx, SW / 2 + 0.005, cz, w, SW + 0.01, d);
      walkLoops.push([x0 + 1.9, z0 + 1.9, x1 - 1.9, z1 - 1.9]);

      // street lamps and trees along each edge, hydrant and bin here and there
      for (const k of [6, 18]) {
        lamp(x0 + k, z0 + 0.7, 0, -1);
        lamp(x0 + k, z1 - 0.7, 0, 1);
        lamp(x0 + 0.7, z0 + k, -1, 0);
        lamp(x1 - 0.7, z0 + k, 1, 0);
      }
      if (type !== "park") {
        tree(x0 + 12, z0 + 1, 0.9);
        tree(x0 + 12, z1 - 1, 0.9);
        tree(x0 + 1, z0 + 12, 0.9);
        tree(x1 - 1, z0 + 12, 0.9);
      }
      hydrant(x0 + 3, z0 + 0.8);
      hydrant(x1 - 3, z1 - 0.8);
      bin(x0 + 9, z1 - 0.8);
      bin(x1 - 0.8, z0 + 9);
      if (r() < 0.5) mailbox(x0 + 0.9, z0 + 15);
      // parking meters along the kerb
      for (const k of [4.5, 8, 15.5, 19]) {
        cyl(metal, x0 + k, SW + 0.55, z1 - 0.45, 0.035, 0.035, 1.1, 6);
        box(steel, x0 + k, SW + 1.2, z1 - 0.45, 0.16, 0.26, 0.12);
        cyl(metal, x1 - 0.45, SW + 0.55, z0 + k, 0.035, 0.035, 1.1, 6);
        box(steel, x1 - 0.45, SW + 1.2, z0 + k, 0.12, 0.26, 0.16);
      }
      // parked cars along the kerb south and east of the block
      if (j < 4) for (const k of [5, 17]) if (r() < 0.5) parkSpots.push({ x: x0 + k, z: z1 + ROAD / 2 - PARK_LANE, rot: Math.PI / 2 });
      if (i < 4) for (const k of [5, 17]) if (r() < 0.4) parkSpots.push({ x: x1 + ROAD / 2 - PARK_LANE, z: z0 + k, rot: 0 });

      if (type === "city") {
        // 2 x 2 lots of 8 m with a 2 m alley; some lots are parking lots
        for (let a = 0; a < 2; a++)
          for (let b = 0; b < 2; b++) {
            const lx = x0 + 3 + a * 10,
              lz = z0 + 3 + b * 10;
            if (r() < 0.18) {
              const lot = new THREE.Mesh(new THREE.BoxGeometry(8, 0.02, 8), lotAsphalt);
              lot.position.set(lx + 4, SW + 0.01, lz + 4);
              lot.receiveShadow = true;
              g.add(lot);
              for (let k = 0; k < 4; k++) box(white, lx + 1 + k * 2, SW + 0.025, lz + 2.5, 0.08, 0.01, 4);
              dumpster(lx + 6.5, lz + 7, false);
              crate(lx + 1, lz + 7, 1.1);
              crate(lx + 1, lz + 7, 0.8, SW + 1.1);
              spots.push({ x: lx + 3.5, y: SW, z: lz + 7, rot: r() * 3 });
              spots.push({ x: lx + 7, y: SW, z: lz + 1.2, rot: r() * 3 });
              continue;
            }
            const low = r() < 0.18;
            const floors = low ? 0 : 1 + Math.floor(Math.pow(r(), 1.6) * 8);
            const h = addBuilding(lx, lz, 8, 8, floors, { shopFace: shopIdx++, fx: a === 0 ? -1 : 1, fz: b === 0 ? -1 : 1 });
            if (low) spots.push({ x: lx + 4, y: h + 0.3, z: lz + 4, rot: r() * 3, roof: true });
          }
        // alley boxes and corner boxes
        spots.push({ x: x0 + 12, y: SW, z: z0 + 5 + r() * 14, rot: r() * 3 });
        spots.push({ x: x0 + 5 + r() * 14, y: SW, z: z0 + 12, rot: r() * 3 });
        spots.push({ x: x0 + (r() < 0.5 ? 1.6 : BLOCK - 1.6), y: SW, z: z0 + (r() < 0.5 ? 2.2 : BLOCK - 2.2), rot: r() * 3 });
        if (r() < 0.4) busStop(x0 + 12, z1 - 1.6, true, -1);
        else bench(x0 + 6, z1 - 1.5, 0);
      } else if (type === "park") {
        // grass, crossing footpaths, trees, a stone fountain
        for (const [cx, cz, w, d] of [
          [x0 + 12, z0 + 12, 2.4, 22],
          [x0 + 12, z0 + 12, 22, 2.4],
        ])
          box(sidewalkMat, cx, SW + 0.01, cz, w, 0.02, d);
        for (let k = 0; k < 10; k++) {
          const tx = x0 + 3 + r() * 18,
            tz = z0 + 3 + r() * 18;
          if (Math.abs(tx - x0 - 12) < 2.5 || Math.abs(tz - z0 - 12) < 2.5) continue;
          tree(tx, tz, 1 + r() * 0.4, false);
        }
        // round stone planter with a statue in the middle
        cyl(concrete, x0 + 12, SW + 0.35, z0 + 12, 3.2, 3.4, 0.7, 28);
        cyl(std({ map: rep(grass(), 1, 1), roughness: 1 }), x0 + 12, SW + 0.71, z0 + 12, 2.9, 2.9, 0.04, 28);
        cyl(concrete, x0 + 12, SW + 1.4, z0 + 12, 0.6, 0.8, 1.4, 12);
        box(steel, x0 + 12, SW + 2.6, z0 + 12, 0.7, 1.1, 0.5);
        cyl(steel, x0 + 12, SW + 3.4, z0 + 12, 0.32, 0.32, 0.5, 12);
        colliders.push({ minX: x0 + 8.8, maxX: x0 + 15.2, minZ: z0 + 8.8, maxZ: z0 + 15.2, top: SW + 0.7 });
        bench(x0 + 7, z0 + 10.2, 0);
        bench(x0 + 17, z0 + 13.8, Math.PI);
        bench(x0 + 10.2, z0 + 18, Math.PI / 2);
        for (const [bx, bz] of [
          [x0 + 4, z0 + 20],
          [x0 + 20, z0 + 4],
          [x0 + 19, z0 + 19],
        ])
          spots.push({ x: bx, y: SW, z: bz, rot: r() * 3 });
      } else if (type === "station") {
        // raised platform, canopy, a parked commuter train
        const plat = new THREE.Mesh(boxUV(new THREE.BoxGeometry(8, 1.2, 22), 8, 1.2, 22, 4, 4, 4), sidewalkMat);
        plat.position.set(x0 + 6, 0.6, z0 + 12);
        plat.receiveShadow = true;
        g.add(plat);
        colliders.push({ minX: x0 + 2, maxX: x0 + 10, minZ: z0 + 1, maxZ: z0 + 23, top: 1.2 });
        box(yellow, x0 + 9.75, 1.21, z0 + 12, 0.4, 0.02, 22);
        const silver = std({ color: 0xb9bec6, metalness: 0.75, roughness: 0.3 });
        const winBand = std({ color: 0x1b242c, roughness: 0.1, metalness: 0.5 });
        const stripe = std({ color: 0xd2401e, roughness: 0.5 });
        for (let k = 0; k < 2; k++) {
          const cz = z0 + 6.5 + k * 11;
          box(silver, x0 + 13, 2.2, cz, 3.6, 3.2, 10.4);
          box(winBand, x0 + 13, 2.7, cz, 3.65, 1, 9.6);
          box(stripe, x0 + 13, 1.5, cz, 3.65, 0.3, 10.45);
          box(metal, x0 + 13, 0.35, cz, 3, 0.7, 9.8);
          colliders.push({ minX: x0 + 11.2, maxX: x0 + 14.8, minZ: cz - 5.2, maxZ: cz + 5.2, top: 3.8, tall: true });
        }
        for (const s of [-0.75, 0.75]) box(steel, x0 + 13 + s, 0.06, z0 + 12, 0.1, 0.12, 24);
        box(metal, x0 + 6, 5, z0 + 12, 8.6, 0.25, 22);
        for (const k of [2, 12, 22]) box(metal, x0 + 3, 3.1, z0 + k, 0.2, 3.8, 0.2);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: textTex("NULL STATION", "#ffffff", "#1e5aa8", 512, 96, "bold 54px Inter, Arial, sans-serif") }));
        sign.position.set(x0 + 1.85, 4.2, z0 + 12);
        sign.rotation.y = -Math.PI / 2;
        g.add(sign);
        for (const k of [6, 12, 18]) bench(x0 + 4, z0 + k, Math.PI / 2, 1.2);
        // benches are on the platform: lift them
        spots.push({ x: x0 + 6, y: 1.2, z: z0 + 3, rot: 0.3 });
        spots.push({ x: x0 + 6, y: 1.2, z: z0 + 21, rot: 1.2 });
        spots.push({ x: x0 + 18.5, y: SW, z: z0 + 22, rot: 0.6 });
        spots.push({ x: x0 + 20, y: SW, z: z0 + 2, rot: 2.2 });
        for (let k = 0; k < 3; k++) crate(x0 + 1.2, z0 + 7 + k * 1.3, 1.1);
      } else {
        // Game House plaza: planters and benches
        for (const [tx, tz] of [
          [x0 + 3, z0 + 3],
          [x0 + 21, z0 + 3],
          [x0 + 3, z0 + 21],
          [x0 + 21, z0 + 21],
        ]) {
          box(concrete, tx, SW + 0.3, tz, 2.2, 0.6, 2.2);
          tree(tx, tz, 0.9, false);
          colliders.push({ minX: tx - 1.1, maxX: tx + 1.1, minZ: tz - 1.1, maxZ: tz + 1.1, top: SW + 0.6 });
        }
        bench(x0 + 6, z0 + 18, 0);
        bench(x0 + 18, z0 + 18, 0);
      }
    }

  // ---------- the Game House: a small brick arcade with a big neon sign ----------
  const hw = 9,
    hd = 8,
    hh = 5.5;
  const house = new THREE.Group();
  const brick = facadeMat("darkbrick", 0);
  const hgeo = boxUV(new THREE.BoxGeometry(hw, hh, hd), hw, hh, hd, 10, 14);
  const walls = new THREE.Mesh(hgeo, [brick, brick, roofMat, brick, brick, brick]);
  walls.position.y = hh / 2;
  walls.castShadow = walls.receiveShadow = true;
  house.add(walls);
  const front = hd / 2;
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    house.add(m);
    return m;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(hw + 0.4, 0.4, hd + 0.4), cornice), 0, hh + 0.2, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 0.1), std({ color: 0x1a1512 })), 0, 1.5, front + 0.03);
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.7), glow(0xffd08a, 0.9, 1.6)), 0, 1.4, front + 0.09);
  for (const s of [-1, 1]) {
    add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), glow(0x7fe08a, 0.5, 1.4)), s * 2.9, 1.9, front + 0.06);
    add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.3), cornice), s * 2.9, 0.95, front + 0.12);
  }
  // awning
  const awn = add(new THREE.Mesh(new THREE.BoxGeometry(hw - 0.6, 0.08, 1.4), std({ color: 0xc8261c, roughness: 0.7 })), 0, 3.35, front + 0.65);
  awn.rotation.x = 0.25;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.5),
    new THREE.MeshBasicMaterial({ map: textTex("GAME HOUSE", "#ffb02e", "rgba(20,10,20,0.92)", 640, 130, "bold 54px 'Press Start 2P', monospace"), toneMapped: false }),
  );
  nightBasic.push({ m: sign.material as THREE.MeshBasicMaterial, day: 1, night: 1.9, base: new THREE.Color(1, 1, 1) });
  add(sign, 0, hh - 0.9, front + 0.06);
  house.position.set(0, SW, -1);
  g.add(house);
  colliders.push({ minX: -hw / 2, maxX: hw / 2, minZ: -1 - hd / 2, maxZ: -1 + hd / 2, top: hh + SW, tall: true });
  box(std({ color: 0x5a2a26, roughness: 0.9 }), HOUSE_DOOR.x, SW + 0.01, 3.9, 2.6, 0.02, 1.6);

  // ---------- city edge: invisible walls and distant skyline ----------
  for (const [a, b, c, d] of [
    [-LIMIT - 5, LIMIT + 5, -LIMIT - 5, -LIMIT],
    [-LIMIT - 5, LIMIT + 5, LIMIT, LIMIT + 5],
    [-LIMIT - 5, -LIMIT, -LIMIT - 5, LIMIT + 5],
    [LIMIT, LIMIT + 5, -LIMIT - 5, LIMIT + 5],
  ])
    colliders.push({ minX: a, maxX: b, minZ: c, maxZ: d, top: 50 });
  for (let k = 0; k < 110; k++) {
    const ring = k < 60 ? 0 : 1;
    const a = ((k % 60) / (ring ? 50 : 60)) * Math.PI * 2 + ring * 0.05;
    const w = 12 + r() * 10,
      h = (ring ? 40 : 20) + r() * (ring ? 70 : 45);
    const mat = facadeMat(FACADES[k % FACADES.length], k % 2);
    const t = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, w), w, h, w, 10, 14), [mat, mat, roofMat, mat, mat, mat]);
    const rad = ring ? 165 + r() * 20 : 118 + r() * 12;
    t.position.set(Math.cos(a) * rad, h / 2, Math.sin(a) * rad);
    t.rotation.y = -a;
    g.add(t);
  }
  const outer = new THREE.Mesh(new THREE.RingGeometry(100, 200, 48), std({ color: 0x2a2a2e, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  g.add(outer);

  // ---------- merge everything ----------
  const poolTex = canvasTex(128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
  });
  // lamp light on the ground: soft, and faded out with distance so far pools never stack up
  const poolMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: { map: { value: poolTex }, color: { value: new THREE.Color(0xffc98a) }, opacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying vec2 vUv; varying float vD;
      void main(){ float a = texture2D(map, vUv).a * opacity * (1.0 - smoothstep(18.0, 38.0, vD)); gl_FragColor = vec4(color * a, 1.0); }`,
  });
  g.add(new THREE.Mesh(mergeGeometries(pools), poolMat));
  for (const [m, list] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.castShadow = m !== white && m !== yellow;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // ---------- animated LED billboards ----------
  const bakeLater = true;
  const SCREENS = [
    { a: "THE WORLD OF NULLS", b: "IS COMING TO NEAR", c1: "#ff3fa4", c2: "#3fd6ff" },
    { a: "MEMORY HUNT", b: "FIND ALL 4 CARDS", c1: "#ffb02e", c2: "#9b4dff" },
    { a: "DO NOT ERASE", b: "PLAYER SELECT", c1: "#2fd27a", c2: "#ff7a1a" },
  ];
  const screens = SCREENS.map((sc) => {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 144;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return { cv, t, sc };
  });
  billboards.forEach((b, k) => {
    const sc = screens[k % screens.length];
    const frame = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, b.h + 0.4, 0.3), metal);
    frame.position.set(b.x, b.y, b.z);
    frame.rotation.y = b.ry;
    frame.translateZ(-0.12);
    g.add(frame);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: sc.t, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    m.position.set(b.x, b.y, b.z);
    m.rotation.y = b.ry;
    m.translateZ(0.06);
    g.add(m);
  });
  let lastDraw = -1;
  const drawScreens = (t: number) => {
    for (const { cv, t: tex, sc } of screens) {
      const c = cv.getContext("2d")!;
      const ph = Math.floor(t / 4) % 3;
      const grd = c.createLinearGradient(0, 0, 256, 144);
      grd.addColorStop(0, "#0b0716");
      grd.addColorStop(1, ph === 1 ? sc.c1 + "66" : "#170b2a");
      c.fillStyle = grd;
      c.fillRect(0, 0, 256, 144);
      c.textAlign = "center";
      c.textBaseline = "middle";
      if (ph === 0) {
        c.font = "15px 'Press Start 2P', monospace";
        c.fillStyle = sc.c1;
        c.fillText(sc.a, 128, 54);
        c.fillStyle = sc.c2;
        c.font = "11px 'Press Start 2P', monospace";
        c.fillText(sc.b, 128, 88);
      } else if (ph === 1) {
        c.font = "72px 'Press Start 2P', monospace";
        c.fillStyle = sc.c2;
        c.fillText("n", 128, 72 + Math.sin(t * 4) * 8);
      } else {
        c.font = "22px 'Press Start 2P', monospace";
        c.fillStyle = sc.c1;
        const msg = `${sc.a} · ${sc.b} · `;
        const wdt = c.measureText(msg).width;
        const off = (t * 70) % wdt;
        c.textAlign = "left";
        for (let x = -off; x < 256; x += wdt) c.fillText(msg, x, 72);
      }
      c.fillStyle = "rgba(0,0,0,0.22)";
      for (let y = 0; y < 144; y += 3) c.fillRect(0, y, 256, 1);
      tex.needsUpdate = true;
    }
  };

  // merge every static piece of the city by material: a few dozen draw calls for the whole town
  if (bakeLater) {
    const transparent = new Set<THREE.Object3D>();
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m) && (m.transparent || m === glass)) transparent.add(o);
    });
    for (const mesh of bake(g, new Set(), null, transparent)) {
      const m = mesh.material as THREE.Material;
      mesh.castShadow = m !== white && m !== yellow && m !== roadMat && m !== sidewalkMat;
    }
  }

  let night = 0;
  const setEnv = (n: number, wet: number) => {
    night = n;
    for (const { m, k } of nightEmissive) m.emissiveIntensity = 0.04 + n * k;
    for (const { m, day, night: nk, base } of nightBasic) m.color.copy(base).multiplyScalar(day + (nk - day) * n);
    lampHead.color.setRGB(1, 0.88, 0.66).multiplyScalar(0.3 + n * 3);
    poolMat.uniforms.opacity.value = n * 0.28;
    poolMat.visible = n > 0.05;
    void wet;
  };
  const tick = (t: number) => {
    for (const axis of ["x", "z"] as const) {
      const s = signalFor(axis, t);
      for (const c of ["red", "yellow", "green"] as Signal[]) {
        const base = c === "red" ? [1, 0.17, 0.1] : c === "yellow" ? [1, 0.69, 0.1] : [0.17, 1, 0.48];
        const k = c === s ? 2.2 + night * 1.5 : 0.08;
        sig[axis][c].color.setRGB(base[0] * k, base[1] * k, base[2] * k);
      }
    }
    if (t - lastDraw > 0.08) {
      lastDraw = t;
      drawScreens(t);
    }
  };

  // ---------- minimap ----------
  const map = document.createElement("canvas");
  map.width = map.height = 256;
  const mc = map.getContext("2d")!;
  const S = 256 / (2 * LIMIT);
  const mapScale = (x: number, z: number): [number, number] => [(x + LIMIT) * S, (z + LIMIT) * S];
  mc.fillStyle = "#3b3b40";
  mc.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const [px, pz] = mapScale(blockMin(i), blockMin(j));
      const type = blockTypes(i, j);
      mc.fillStyle = type === "park" ? "#4c6b3a" : type === "house" ? "#7a3a30" : "#8a867e";
      mc.fillRect(px, pz, BLOCK * S, BLOCK * S);
    }
  mc.fillStyle = "#5e5b56";
  for (const c of colliders) {
    if (c.top < 2.5 || c.maxX - c.minX > 50 || c.maxZ - c.minZ > 50 || c.maxX - c.minX < 1) continue;
    const [px, pz] = mapScale(c.minX, c.minZ);
    mc.fillRect(px, pz, (c.maxX - c.minX) * S, (c.maxZ - c.minZ) * S);
  }
  mc.fillStyle = "#d8b23a";
  for (const rc of ROAD_CENTERS) {
    const [a] = mapScale(rc, 0);
    mc.fillRect(a - 0.5, 0, 1, 256);
    mc.fillRect(0, a - 0.5, 256, 1);
  }

  const npcSpots = [
    { x: -6, z: 9, face: 0.6 },
    { x: 6, z: 9.5, face: -0.6 },
    { x: 8.5, z: 2.5, face: -1.4 },
  ];
  return { group: g, colliders, spots, npcSpots, parkSpots, walkLoops, map, mapScale, tick, setEnv };
}

function verticalText(text: string, color: string) {
  return canvasTex(128, 512, (c) => {
    c.fillStyle = "#0c0a10";
    c.fillRect(0, 0, 128, 512);
    c.strokeStyle = color;
    c.lineWidth = 6;
    c.shadowColor = color;
    c.shadowBlur = 16;
    c.strokeRect(10, 10, 108, 492);
    c.fillStyle = color;
    c.font = "bold 74px Inter, Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const n = text.length;
    for (let k = 0; k < n; k++) c.fillText(text[k], 64, 256 + (k - (n - 1) / 2) * 84);
  });
}
