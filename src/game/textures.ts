// Procedural "photo" textures painted on canvas: asphalt, sidewalk, facades, shopfronts, roofs.
// Everything is generated at load time, so the game ships with no image files.
import * as THREE from "three";
import { rng } from "./data";

const cache = new Map<string, THREE.Texture>();

function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, color = true, seed = 7): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!, rng(seed));
  const t = new THREE.CanvasTexture(cv);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** Copy of a cached texture with its own repeat. Shares the image. */
export function rep(t: THREE.Texture, x: number, y: number): THREE.Texture {
  const c = t.clone();
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

function noise(c: CanvasRenderingContext2D, r: () => number, w: number, h: number, amount: number, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = r() < 0.5 ? 0 : 255;
    c.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    const s = 1 + r() * 2.5;
    c.fillRect(r() * w, r() * h, s, s);
  }
}

function blotches(c: CanvasRenderingContext2D, r: () => number, w: number, h: number, n: number, color: string, maxR: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * w,
      y = r() * h,
      rad = maxR * (0.3 + r() * 0.7);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export const asphalt = () =>
  make("asphalt", 512, 512, (c, r) => {
    c.fillStyle = "#3a3a3d";
    c.fillRect(0, 0, 512, 512);
    noise(c, r, 512, 512, 26000, 0.14);
    blotches(c, r, 512, 512, 14, "rgba(20,20,22,0.35)", 90);
    blotches(c, r, 512, 512, 8, "rgba(90,88,84,0.25)", 70);
    // patches
    for (let i = 0; i < 3; i++) {
      const v = r() < 0.5 ? 34 : 58;
      c.fillStyle = `rgba(${v},${v},${v + 2},0.5)`;
      c.fillRect(r() * 440, r() * 440, 30 + r() * 70, 20 + r() * 50);
    }
    // cracks
    c.strokeStyle = "rgba(10,10,12,0.6)";
    c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = r() * 512,
        y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (r() - 0.5) * 26;
        y += (r() - 0.5) * 26;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });

/** Roughness for asphalt: darker = shinier (puddles). */
export const asphaltRough = () =>
  make(
    "asphaltRough",
    256,
    256,
    (c, r) => {
      c.fillStyle = "#e0e0e0";
      c.fillRect(0, 0, 256, 256);
      blotches(c, r, 256, 256, 26, "rgba(40,40,40,0.9)", 34);
      noise(c, r, 256, 256, 6000, 0.2);
    },
    false,
    3,
  );

export const sidewalk = () =>
  make("sidewalk", 512, 512, (c, r) => {
    c.fillStyle = "#8f8b84";
    c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = 128 + Math.floor((r() - 0.5) * 22);
        c.fillStyle = `rgb(${v + 8},${v + 4},${v - 2})`;
        c.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
      }
    noise(c, r, 512, 512, 22000, 0.12);
    blotches(c, r, 512, 512, 10, "rgba(60,55,50,0.25)", 60);
    // gum spots
    for (let i = 0; i < 30; i++) {
      c.fillStyle = "rgba(50,50,50,0.4)";
      c.beginPath();
      c.arc(r() * 512, r() * 512, 1.5 + r() * 2, 0, 7);
      c.fill();
    }
    c.fillStyle = "rgba(40,38,36,0.7)";
    for (let k = 0; k <= 4; k++) {
      c.fillRect(k * 128 - 1, 0, 2, 512);
      c.fillRect(0, k * 128 - 1, 512, 2);
    }
  });

export const curbTex = () =>
  make("curb", 256, 64, (c, r) => {
    c.fillStyle = "#a6a29a";
    c.fillRect(0, 0, 256, 64);
    noise(c, r, 256, 64, 4000, 0.15);
    c.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 0; x < 256; x += 64) c.fillRect(x, 0, 2, 64);
  });

export const grass = () =>
  make("grass", 512, 512, (c, r) => {
    c.fillStyle = "#3f5a2a";
    c.fillRect(0, 0, 512, 512);
    blotches(c, r, 512, 512, 30, "rgba(90,110,50,0.35)", 70);
    blotches(c, r, 512, 512, 20, "rgba(30,45,20,0.35)", 60);
    for (let i = 0; i < 16000; i++) {
      const g = 70 + r() * 70;
      c.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.4},0.5)`;
      const x = r() * 512,
        y = r() * 512;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
      c.stroke();
    }
  });

export const gravel = () =>
  make("gravel", 256, 256, (c, r) => {
    c.fillStyle = "#5d5a56";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const v = 60 + r() * 90;
      c.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      c.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    blotches(c, r, 256, 256, 6, "rgba(30,30,30,0.3)", 50);
  });

export type FacadeStyle = "brick" | "concrete" | "glass" | "stucco" | "darkbrick";
export const FACADES: FacadeStyle[] = ["brick", "concrete", "glass", "stucco", "darkbrick"];

/**
 * One facade tile = 4 bays x 4 floors (10 m x 14 m). Returns the colour map and an emissive map
 * with some windows lit, used at night.
 */
export function facade(style: FacadeStyle, variant = 0): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const seed = FACADES.indexOf(style) * 31 + variant * 7 + 1;
  const W = 512,
    H = 716;
  const bw = W / 4,
    fh = H / 4;
  const wall: Record<FacadeStyle, string> = { brick: "#8a4a36", concrete: "#9a968e", glass: "#3c5560", stucco: "#c9b896", darkbrick: "#4e3a34" };
  const map = make(`fac-${style}-${variant}`, W, H, (c, r) => {
    c.fillStyle = wall[style];
    c.fillRect(0, 0, W, H);
    if (style === "brick" || style === "darkbrick") {
      for (let y = 0; y < H; y += 8) {
        const off = (y / 8) % 2 ? 0 : 12;
        for (let x = -off; x < W; x += 24) {
          const v = (r() - 0.5) * 30;
          const base = style === "brick" ? [140, 72, 52] : [80, 58, 52];
          c.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.6},${base[2] + v * 0.5})`;
          c.fillRect(x + 1, y + 1, 22, 6);
        }
      }
    } else if (style === "concrete") {
      noise(c, r, W, H, 20000, 0.12);
      c.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < H; y += fh) c.fillRect(0, y, W, 3);
      for (let x = 0; x < W; x += bw) c.fillRect(x, 0, 2, H);
      blotches(c, r, W, H, 12, "rgba(60,58,52,0.25)", 90);
    } else if (style === "stucco") {
      noise(c, r, W, H, 26000, 0.1);
      blotches(c, r, W, H, 10, "rgba(120,100,70,0.25)", 100);
    }
    for (let fy = 0; fy < 4; fy++)
      for (let bx = 0; bx < 4; bx++) {
        const x = bx * bw,
          y = fy * fh;
        if (style === "glass") {
          // curtain wall: tinted glass with mullions and a reflection gradient
          const g = c.createLinearGradient(x, y, x + bw, y + fh);
          g.addColorStop(0, "#6f95a8");
          g.addColorStop(0.5, "#2b4554");
          g.addColorStop(1, "#4d7487");
          c.fillStyle = g;
          c.fillRect(x + 3, y + 3, bw - 6, fh - 14);
          c.fillStyle = "#1f2a30";
          c.fillRect(x, y + fh - 11, bw, 11);
          c.fillRect(x + bw / 2 - 1, y, 2, fh);
          continue;
        }
        const wx = x + bw * 0.2,
          wy = y + fh * 0.22,
          ww = bw * 0.6,
          wh = fh * 0.56;
        // frame, glass with sky reflection, sill, lintel
        c.fillStyle = style === "stucco" ? "#efe6d2" : "#d9d4c8";
        c.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        const g = c.createLinearGradient(wx, wy, wx, wy + wh);
        g.addColorStop(0, "#8aa3b5");
        g.addColorStop(0.45, "#2a3640");
        g.addColorStop(1, "#1a2026");
        c.fillStyle = g;
        c.fillRect(wx, wy, ww, wh);
        if (r() < 0.4) {
          // curtains
          c.fillStyle = ["#a88f6a", "#8a6f8f", "#c9c3b0", "#6a7f5a"][Math.floor(r() * 4)];
          c.fillRect(wx, wy, ww * (0.2 + r() * 0.3), wh);
        }
        c.fillStyle = "#e6e2d8";
        c.fillRect(wx, wy + wh / 2 - 1, ww, 2);
        c.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(wx - 7, wy + wh + 5, ww + 14, 5);
        if (style === "stucco" && fy % 2 === 1 && bx % 2 === 0) {
          // little balcony railing
          c.fillStyle = "#2a2a2a";
          c.fillRect(wx - 8, wy + wh * 0.62, ww + 16, 3);
          for (let k = 0; k <= 10; k++) c.fillRect(wx - 8 + k * ((ww + 16) / 10), wy + wh * 0.62, 2, wh * 0.4);
        }
        // stains under sills
        const sg = c.createLinearGradient(0, wy + wh + 10, 0, wy + wh + 40);
        sg.addColorStop(0, "rgba(0,0,0,0.12)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = sg;
        c.fillRect(wx, wy + wh + 10, ww, 30);
      }
    // dirt at the top and bottom
    const dg = c.createLinearGradient(0, H - 60, 0, H);
    dg.addColorStop(0, "rgba(0,0,0,0)");
    dg.addColorStop(1, "rgba(0,0,0,0.15)");
    c.fillStyle = dg;
    c.fillRect(0, H - 60, W, 60);
  }, true, seed);
  const lit = make(
    `lit-${style}-${variant}`,
    W,
    H,
    (c, r) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, W, H);
      for (let fy = 0; fy < 4; fy++)
        for (let bx = 0; bx < 4; bx++) {
          if (r() > 0.45) continue;
          const warm = r() < 0.8;
          c.fillStyle = warm ? `rgb(${200 + r() * 40},${140 + r() * 30},${70 + r() * 30})` : "rgb(120,160,200)";
          const x = bx * bw,
            y = fy * fh;
          if (style === "glass") c.fillRect(x + 3, y + 3, bw - 6, fh - 14);
          else c.fillRect(x + bw * 0.2, y + fh * 0.22, bw * 0.6, fh * 0.56);
        }
    },
    true,
    seed + 1000,
  );
  return { map, lit };
}

const SHOPS: [string, string, string][] = [
  ["PIZZA", "#c0392b", "#f1c40f"],
  ["24/7 MART", "#27ae60", "#ffffff"],
  ["LAUNDRY", "#2980b9", "#ffffff"],
  ["DINER", "#d35400", "#fff2d0"],
  ["PAWN", "#8e44ad", "#f9e79f"],
  ["ARCADE", "#e84393", "#ffffff"],
  ["PHARMACY", "#16a085", "#ffffff"],
  ["RAMEN", "#7f1d1d", "#ffd7a1"],
  ["BARBER", "#34495e", "#ecf0f1"],
  ["MUSIC", "#2d3436", "#fdcb6e"],
];

/** Ground floor shopfront tile (10 m wide x 4 m tall): awning, sign, big windows, door. */
export function shopfront(i: number): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const [name, col, txt] = SHOPS[i % SHOPS.length];
  const W = 512,
    H = 205;
  const map = make(`shop-${i}`, W, H, (c, r) => {
    c.fillStyle = "#2a2624";
    c.fillRect(0, 0, W, H);
    // sign band
    c.fillStyle = col;
    c.fillRect(0, 0, W, 46);
    c.fillStyle = txt;
    c.font = "bold 30px Inter, Arial, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(name, W / 2, 24);
    // awning stripes
    for (let x = 0; x < W; x += 32) {
      c.fillStyle = (x / 32) % 2 ? col : "#eee8dc";
      c.beginPath();
      c.moveTo(x, 46);
      c.lineTo(x + 32, 46);
      c.lineTo(x + 32, 66);
      c.quadraticCurveTo(x + 16, 74, x, 66);
      c.fill();
    }
    // windows with goods inside
    const glass = (x: number, w: number) => {
      const g = c.createLinearGradient(x, 76, x + w, H);
      g.addColorStop(0, "#5d7383");
      g.addColorStop(0.5, "#1d252b");
      g.addColorStop(1, "#384650");
      c.fillStyle = g;
      c.fillRect(x, 78, w, H - 96);
      for (let k = 0; k < 6; k++) {
        c.fillStyle = `hsl(${r() * 360},40%,${30 + r() * 25}%)`;
        c.fillRect(x + 6 + r() * (w - 30), 130 + r() * 40, 10 + r() * 18, 12 + r() * 20);
      }
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.beginPath();
      c.moveTo(x + w * 0.1, 78);
      c.lineTo(x + w * 0.35, 78);
      c.lineTo(x + w * 0.15, H - 18);
      c.lineTo(x, H - 18);
      c.fill();
    };
    glass(14, 190);
    glass(308, 190);
    // door
    c.fillStyle = "#1a1512";
    c.fillRect(220, 82, 72, H - 82);
    c.fillStyle = "#3a4a55";
    c.fillRect(228, 92, 56, 70);
    c.fillStyle = "#c9a54a";
    c.fillRect(278, 140, 4, 12);
    c.fillStyle = "#5a5450";
    c.fillRect(0, H - 18, W, 18);
    noise(c, r, W, H, 3000, 0.1);
  }, true, i + 50);
  const lit = make(
    `shoplit-${i}`,
    W,
    H,
    (c) => {
      c.fillStyle = "#000";
      c.fillRect(0, 0, W, H);
      c.fillStyle = col;
      c.fillRect(0, 0, W, 46);
      const g = c.createLinearGradient(0, 78, 0, H);
      g.addColorStop(0, "#8a6a40");
      g.addColorStop(1, "#3a2a18");
      c.fillStyle = g;
      c.fillRect(14, 78, 190, H - 96);
      c.fillRect(308, 78, 190, H - 96);
      c.fillRect(228, 92, 56, 70);
    },
    true,
    i + 90,
  );
  return { map, lit };
}

export const roofTex = gravel;

export const woodTex = () =>
  make("wood", 256, 256, (c, r) => {
    c.fillStyle = "#6b4a32";
    c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      c.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.15})`;
      c.fillRect(0, y, 256, 2);
      for (let k = 0; k < 40; k++) {
        c.strokeStyle = `rgba(40,25,15,${r() * 0.3})`;
        const yy = y + r() * 30;
        c.beginPath();
        c.moveTo(0, yy);
        c.bezierCurveTo(80, yy + (r() - 0.5) * 6, 160, yy + (r() - 0.5) * 6, 256, yy);
        c.stroke();
      }
    }
  });

export const brickPlain = () =>
  make("brickPlain", 512, 512, (c, r) => {
    c.fillStyle = "#3a2a26";
    c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) {
      const off = (y / 32) % 2 ? 0 : 48;
      for (let x = -off; x < 512; x += 96) {
        const v = (r() - 0.5) * 34;
        c.fillStyle = `rgb(${150 + v},${78 + v * 0.6},${58 + v * 0.5})`;
        c.fillRect(x + 3, y + 3, 90, 26);
        c.fillStyle = "rgba(255,255,255,0.06)";
        c.fillRect(x + 3, y + 3, 90, 5);
      }
    }
    noise(c, r, 512, 512, 9000, 0.12);
  });

export const wallpaper = () =>
  make("wallpaper", 256, 256, (c, r) => {
    c.fillStyle = "#26304a";
    c.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      c.fillStyle = "rgba(255,255,255,0.045)";
      c.fillRect(x, 0, 16, 256);
    }
    c.fillStyle = "rgba(255,190,90,0.16)";
    for (let y = 16; y < 256; y += 64) for (let x = 16; x < 256; x += 64) c.fillRect(x - 3, y - 3, 6, 6);
    noise(c, r, 256, 256, 3000, 0.06);
  });

export const floorWood = () =>
  make("floorWood", 512, 512, (c, r) => {
    for (let y = 0; y < 512; y += 64) {
      const off = (y / 64) % 2 ? 0 : 128;
      for (let x = -off; x < 512; x += 256) {
        const v = (r() - 0.5) * 26;
        c.fillStyle = `rgb(${150 + v},${104 + v * 0.8},${66 + v * 0.6})`;
        c.fillRect(x, y, 256, 64);
        for (let k = 0; k < 14; k++) {
          c.strokeStyle = `rgba(70,40,20,${0.08 + r() * 0.14})`;
          const yy = y + 4 + r() * 56;
          c.beginPath();
          c.moveTo(x, yy);
          c.bezierCurveTo(x + 80, yy + (r() - 0.5) * 8, x + 170, yy + (r() - 0.5) * 8, x + 256, yy);
          c.stroke();
        }
        c.fillStyle = "rgba(30,15,5,0.55)";
        c.fillRect(x, y, 256, 2);
        c.fillRect(x, y, 2, 64);
      }
    }
  });
