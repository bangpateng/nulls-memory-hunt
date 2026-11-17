// The four games inside the memory cards.
import type { CharId, GameId } from "../game/data";
import { sfx } from "../game/audio";
import { bomb, C, H, hero, rect, text, W, type MiniGame, type Pad } from "./lcd";

// ---------- NULL RUN: endless runner on the subway platform ----------
function nullRun(pad: Pad, char: CharId): MiniGame {
  const GROUND = 118;
  let y = GROUND - 16,
    vy = 0,
    t = 0,
    dist = 0,
    coins = 0,
    speed = 70,
    alive = true;
  let obs: { x: number; w: number; h: number }[] = [];
  let pick: { x: number; y: number }[] = [];
  let nextObs = 1.2,
    nextCoin = 0.6;
  const onGround = () => y >= GROUND - 16;
  return {
    update(dt) {
      if (!alive) return false;
      t += dt;
      speed = 70 + t * 3.2;
      dist += speed * dt;
      if (pad.aPressed && onGround()) {
        vy = -150;
        sfx.jump();
      }
      vy += (pad.a && vy < 0 ? 330 : 620) * dt;
      y = Math.min(GROUND - 16, y + vy * dt);
      if (onGround()) vy = 0;
      nextObs -= dt;
      if (nextObs <= 0) {
        const tall = Math.random() < 0.35;
        obs.push({ x: W + 4, w: tall ? 7 : 12, h: tall ? 22 : 11 });
        nextObs = 0.9 + Math.random() * 1.1 - Math.min(0.4, t / 120);
      }
      nextCoin -= dt;
      if (nextCoin <= 0) {
        const hy = GROUND - 30 - Math.random() * 30;
        for (let k = 0; k < 3; k++) pick.push({ x: W + 4 + k * 12, y: hy });
        nextCoin = 1.6 + Math.random() * 1.5;
      }
      for (const o of obs) o.x -= speed * dt;
      for (const c of pick) c.x -= speed * dt;
      obs = obs.filter((o) => o.x > -20);
      pick = pick.filter((c) => {
        if (c.x < 30 && c.x > 14 && Math.abs(c.y - (y + 8)) < 11) {
          coins++;
          sfx.point();
          return false;
        }
        return c.x > -10;
      });
      for (const o of obs) if (o.x < 34 && o.x + o.w > 26 && y + 16 > GROUND - o.h + 2) {
        alive = false;
        sfx.hit();
      }
      return alive;
    },
    draw(g) {
      rect(g, 0, 0, W, H, C[3]);
      // pillars and a train in the back, scrolling slower
      const off = (dist * 0.3) % 40;
      for (let x = -off; x < W; x += 40) rect(g, x, 20, 6, GROUND - 20, C[2]);
      const toff = (dist * 0.15) % 64;
      for (let x = -toff; x < W; x += 64) {
        rect(g, x, 46, 58, 30, C[2]);
        rect(g, x + 6, 52, 14, 10, C[3]);
        rect(g, x + 24, 52, 14, 10, C[3]);
        rect(g, x + 42, 52, 10, 10, C[3]);
      }
      rect(g, 0, GROUND, W, 2, C[0]);
      rect(g, 0, GROUND + 2, W, H - GROUND, C[1]);
      const lo = dist % 16;
      for (let x = -lo; x < W; x += 16) rect(g, x, GROUND + 8, 8, 2, C[2]);
      for (const o of obs) {
        rect(g, o.x, GROUND - o.h, o.w, o.h, C[0]);
        if (o.w > 8) rect(g, o.x + 3, GROUND - o.h - 2, o.w - 6, 2, C[0]);
      }
      for (const c of pick) {
        rect(g, c.x, c.y, 6, 6, C[0]);
        rect(g, c.x + 2, c.y + 1, 2, 4, C[2]);
      }
      hero(g, char, 24, y, t * 10, !onGround());
      rect(g, 0, 0, W, 12, C[0]);
      text(g, `${Math.floor(this.score())}`.padStart(5, "0"), 4, 2, C[3]);
      text(g, `x${coins}`, W - 4, 2, C[3], "right");
    },
    score() {
      return Math.floor(dist / 4) + coins * 25;
    },
  };
}

// ---------- BOMB DODGE: dodge falling bombs, catch stars ----------
function bombDodge(pad: Pad, char: CharId): MiniGame {
  const GROUND = 126;
  let x = 74,
    t = 0,
    lives = 3,
    stars = 0,
    hurt = 0,
    next = 0.8;
  let bombs: { x: number; y: number; v: number; boom: number }[] = [];
  let stars2: { x: number; y: number }[] = [];
  return {
    update(dt) {
      t += dt;
      hurt = Math.max(0, hurt - dt);
      x += ((pad.right ? 1 : 0) - (pad.left ? 1 : 0)) * 95 * dt;
      x = Math.max(2, Math.min(W - 14, x));
      next -= dt;
      if (next <= 0) {
        if (Math.random() < 0.15) stars2.push({ x: 8 + Math.random() * (W - 16), y: 12 });
        else bombs.push({ x: 4 + Math.random() * (W - 14), y: 10, v: 40 + Math.random() * 30 + t * 1.5, boom: 0 });
        next = Math.max(0.22, 0.85 - t / 70);
      }
      for (const b of bombs) {
        if (b.boom > 0) b.boom -= dt;
        else {
          b.y += b.v * dt;
          if (b.y > GROUND - 10) {
            b.boom = 0.35;
            sfx.blip();
          }
        }
        const hitbox = b.boom > 0 ? 14 : 8;
        if (hurt <= 0 && Math.abs(b.x + 5 - (x + 6)) < hitbox && (b.boom > 0 || Math.abs(b.y + 6 - (GROUND - 8)) < 9)) {
          lives--;
          hurt = 1.2;
          b.boom = 0.35;
          b.y = GROUND - 10;
          sfx.hit();
        }
      }
      bombs = bombs.filter((b) => !(b.y >= GROUND - 10 && b.boom <= 0));
      stars2 = stars2.filter((s) => {
        s.y += 45 * dt;
        if (Math.abs(s.x - (x + 6)) < 9 && Math.abs(s.y - (GROUND - 8)) < 10) {
          stars++;
          sfx.coin();
          return false;
        }
        return s.y < GROUND;
      });
      return lives > 0;
    },
    draw(g) {
      rect(g, 0, 0, W, H, C[3]);
      for (let k = 0; k < 5; k++) rect(g, k * 36 + 6, 96 - (k % 2) * 16, 26, 30 + (k % 2) * 16, C[2]);
      rect(g, 0, GROUND, W, H - GROUND, C[1]);
      rect(g, 0, GROUND, W, 2, C[0]);
      for (const s of stars2) {
        rect(g, s.x - 1, s.y - 4, 2, 8, C[0]);
        rect(g, s.x - 4, s.y - 1, 8, 2, C[0]);
      }
      for (const b of bombs) {
        if (b.boom > 0) {
          const r = 14 * (1 - b.boom / 0.35) + 4;
          rect(g, b.x + 5 - r, b.y + 6 - r / 2, r * 2, r, C[1]);
          rect(g, b.x + 5 - r / 2, b.y + 6 - r / 4, r, r / 2, C[0]);
        } else bomb(g, b.x, b.y, Math.floor(t * 8) % 2 === 0);
      }
      if (hurt <= 0 || Math.floor(t * 12) % 2) hero(g, char, x, GROUND - 16, t * 8 * (pad.left || pad.right ? 1 : 0));
      rect(g, 0, 0, W, 12, C[0]);
      text(g, `${this.score()}`.padStart(4, "0"), 4, 2, C[3]);
      text(g, "♥".repeat(0) + "LIFE " + lives, W - 4, 2, C[3], "right");
    },
    score() {
      return Math.floor(t) + stars * 5;
    },
  };
}

// ---------- NULL BREAKER: paddle and bricks ----------
function nullBreaker(pad: Pad): MiniGame {
  const PY = 132;
  let px = 68,
    bx = 80,
    by = 120,
    vx = 50,
    vy = -70,
    lives = 3,
    score = 0,
    level = 1,
    stuck = true;
  let bricks: { x: number; y: number; row: number; alive: boolean }[] = [];
  const build = () => {
    bricks = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) bricks.push({ x: 4 + c * 19, y: 20 + r * 8, row: r, alive: true });
  };
  build();
  return {
    update(dt) {
      px += ((pad.right ? 1 : 0) - (pad.left ? 1 : 0)) * 120 * dt;
      px = Math.max(0, Math.min(W - 24, px));
      if (stuck) {
        bx = px + 12;
        by = PY - 4;
        if (pad.aPressed) {
          stuck = false;
          const sp = 90 + level * 10;
          vx = sp * 0.55 * (Math.random() < 0.5 ? -1 : 1);
          vy = -sp;
        }
        return true;
      }
      bx += vx * dt;
      by += vy * dt;
      if (bx < 2 || bx > W - 2) {
        vx = -vx;
        bx = Math.max(2, Math.min(W - 2, bx));
        sfx.blip();
      }
      if (by < 14) {
        vy = Math.abs(vy);
        sfx.blip();
      }
      if (by > PY - 3 && by < PY + 2 && bx > px - 2 && bx < px + 26 && vy > 0) {
        const off = (bx - (px + 12)) / 13;
        const sp = Math.hypot(vx, vy) * 1.01;
        vx = sp * off * 0.85;
        vy = -Math.sqrt(Math.max(400, sp * sp - vx * vx));
        sfx.blip();
      }
      for (const b of bricks) {
        if (!b.alive) continue;
        if (bx > b.x - 1 && bx < b.x + 18 && by > b.y - 1 && by < b.y + 7) {
          b.alive = false;
          score += (5 - b.row) * 10;
          const fromSide = bx < b.x + 1 || bx > b.x + 16;
          if (fromSide) vx = -vx;
          else vy = -vy;
          sfx.point();
          break;
        }
      }
      if (bricks.every((b) => !b.alive)) {
        level++;
        build();
        stuck = true;
        sfx.win();
      }
      if (by > H + 4) {
        lives--;
        stuck = true;
        sfx.hit();
      }
      return lives > 0;
    },
    draw(g) {
      rect(g, 0, 0, W, H, C[3]);
      for (const b of bricks) if (b.alive) {
        rect(g, b.x, b.y, 18, 6, b.row < 2 ? C[0] : b.row < 4 ? C[1] : C[2]);
      }
      rect(g, px, PY, 24, 4, C[0]);
      rect(g, bx - 2, by - 2, 4, 4, C[0]);
      rect(g, 0, 0, W, 12, C[0]);
      text(g, `${score}`.padStart(5, "0"), 4, 2, C[3]);
      text(g, `L${level} x${lives}`, W - 4, 2, C[3], "right");
      if (stuck) text(g, "PRESS A", W / 2, 90, C[1], "center");
    },
    score() {
      return score;
    },
  };
}

// ---------- MEMORY FLIP: match the pairs ----------
function memoryFlip(pad: Pad, char: CharId): MiniGame {
  const icons = ["rhea", "noir", "meteora", "naxweb3", "bomb", "card"];
  const deck = [...icons, ...icons].sort(() => Math.random() - 0.5).map((id) => ({ id, open: false, done: false }));
  let cur = 0,
    first: number | null = null,
    second: number | null = null,
    wait = 0,
    moves = 0,
    t = 0,
    done = false,
    endT = 0;
  const cell = (i: number) => ({ x: 14 + (i % 4) * 34, y: 18 + Math.floor(i / 4) * 40 });
  return {
    update(dt) {
      if (done) {
        endT += dt;
        return endT < 1.2;
      }
      t += dt;
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0 && first !== null && second !== null) {
          if (deck[first].id === deck[second].id) {
            deck[first].done = deck[second].done = true;
            sfx.coin();
          } else deck[first].open = deck[second].open = false;
          first = second = null;
          if (deck.every((d) => d.done)) {
            done = true;
            sfx.win();
          }
        }
        return true;
      }
      if (pad.dirPressed === "left") cur = (cur + 11) % 12;
      if (pad.dirPressed === "right") cur = (cur + 1) % 12;
      if (pad.dirPressed === "up") cur = (cur + 8) % 12;
      if (pad.dirPressed === "down") cur = (cur + 4) % 12;
      if (pad.dirPressed) sfx.blip();
      if (pad.aPressed && !deck[cur].open && !deck[cur].done) {
        deck[cur].open = true;
        sfx.select();
        if (first === null) first = cur;
        else {
          second = cur;
          moves++;
          wait = 0.6;
        }
      }
      return true;
    },
    draw(g) {
      rect(g, 0, 0, W, H, C[3]);
      deck.forEach((d, i) => {
        const { x, y } = cell(i);
        if (d.open || d.done) {
          rect(g, x, y, 28, 34, C[2]);
          rect(g, x + 1, y + 1, 26, 32, d.done ? C[3] : C[2]);
          if (d.id === "bomb") bomb(g, x + 9, y + 11);
          else if (d.id === "card") {
            rect(g, x + 8, y + 8, 12, 16, C[0]);
            rect(g, x + 10, y + 16, 8, 5, C[3]);
            rect(g, x + 9, y + 24, 10, 2, C[1]);
          } else hero(g, d.id as CharId, x + 8, y + 9, 0);
        } else {
          rect(g, x, y, 28, 34, C[0]);
          rect(g, x + 3, y + 3, 22, 28, C[1]);
          text(g, "n", x + 14, y + 13, C[3], "center");
        }
        if (i === cur && !done) {
          rect(g, x - 2, y - 2, 32, 2, C[0]);
          rect(g, x - 2, y + 34, 32, 2, C[0]);
          rect(g, x - 2, y, 2, 34, C[0]);
          rect(g, x + 28, y, 2, 34, C[0]);
        }
      });
      rect(g, 0, 0, W, 12, C[0]);
      text(g, `MOVES ${moves}`, 4, 2, C[3]);
      text(g, `${Math.floor(t)}s`, W - 4, 2, C[3], "right");
      void char;
    },
    score() {
      if (!deck.every((d) => d.done)) return 0;
      return Math.max(50, 1000 - (moves - 6) * 40 - Math.floor(t) * 4);
    },
  };
}

export function createGame(id: GameId, pad: Pad, char: CharId): MiniGame {
  if (id === "run") return nullRun(pad, char);
  if (id === "bomb") return bombDodge(pad, char);
  if (id === "breaker") return nullBreaker(pad);
  return memoryFlip(pad, char);
}
