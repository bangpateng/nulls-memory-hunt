// The Gameboy screen: 160 x 144 pixels, four shades of green, a tiny pixel font and hero sprites.
import type { CharId } from "../game/data";

export const W = 160;
export const H = 144;
export const C = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const; // darkest .. lightest

export interface Pad {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  a: boolean;
  b: boolean;
  aPressed: boolean;
  bPressed: boolean;
  startPressed: boolean;
  dirPressed: "left" | "right" | "up" | "down" | null;
}
export const newPad = (): Pad => ({ left: false, right: false, up: false, down: false, a: false, b: false, aPressed: false, bPressed: false, startPressed: false, dirPressed: null });

export interface MiniGame {
  update(dt: number): boolean; // false when the game is over
  draw(g: CanvasRenderingContext2D): void;
  score(): number;
}

export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string = C[0], align: CanvasTextAlign = "left", size = 8) {
  g.font = `${size}px 'Press Start 2P', monospace`;
  g.textAlign = align;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.fillText(s, Math.round(x), Math.round(y));
}

export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// A 12 x 16 pixel hero: black body, crescent eyes and each Null's signature look.
export function hero(g: CanvasRenderingContext2D, char: CharId, x: number, y: number, frame: number, air = false) {
  const X = Math.round(x),
    Y = Math.round(y);
  const p = (px: number, py: number, w: number, h: number, c: string) => rect(g, X + px, Y + py, w, h, c);
  // head
  p(2, 2, 8, 7, C[0]);
  p(1, 3, 10, 5, C[0]);
  // eyes
  p(4, 5, 1, 2, C[3]);
  p(7, 5, 1, 2, C[3]);
  p(5, 6, 1, 1, C[3]);
  p(8, 6, 1, 1, C[3]);
  // signature
  if (char === "rhea") {
    p(1, 0, 2, 3, C[0]);
    p(9, 0, 2, 3, C[0]);
    p(3, 2, 6, 1, C[2]);
  } else if (char === "noir") {
    p(1, 1, 10, 2, C[1]);
    p(0, 3, 1, 6, C[1]);
    p(11, 3, 1, 6, C[1]);
    p(3, 5, 3, 2, C[2]);
    p(7, 5, 3, 2, C[2]);
  } else if (char === "meteora") {
    p(1, 1, 10, 2, C[1]);
    p(8, 3, 4, 1, C[1]);
    p(5, 1, 2, 1, C[3]);
  } else {
    p(2, 0, 1, 2, C[0]);
    p(5, -1, 1, 3, C[0]);
    p(8, 0, 1, 2, C[0]);
    p(1, 3, 10, 1, C[1]);
    p(3, 5, 2, 2, C[2]);
    p(7, 5, 2, 2, C[2]);
  }
  // body and legs
  p(3, 9, 6, 4, char === "naxweb3" ? C[1] : char === "meteora" ? C[2] : C[1]);
  const step = air ? 0 : Math.floor(frame) % 2;
  p(3, 13, 2, 3 - step, C[0]);
  p(7, 13, 2, 2 + step, C[0]);
}

export function bomb(g: CanvasRenderingContext2D, x: number, y: number, blink = false) {
  const X = Math.round(x),
    Y = Math.round(y);
  rect(g, X + 1, Y + 3, 8, 7, C[0]);
  rect(g, X, Y + 4, 10, 5, C[0]);
  rect(g, X + 3, Y + 6, 1, 1, C[3]);
  rect(g, X + 6, Y + 6, 1, 1, C[3]);
  rect(g, X + 6, Y + 1, 1, 2, C[1]);
  rect(g, X + 7, Y, 2, 1, blink ? C[3] : C[2]);
}
