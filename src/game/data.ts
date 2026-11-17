// Characters, memory cards and save data for Nulls: Memory Hunt.

export type CharId = "rhea" | "noir" | "meteora" | "naxweb3";
export type AbilityId = "doubleJump" | "nightVision" | "dash" | "radar";

export interface CharDef {
  id: CharId;
  name: string;
  tag: string; // shown on player select, like the "PLAYER 001" labels
  color: string; // accent colour for UI
  bg: string; // player select backdrop
  ability: { id: AbilityId; name: string; text: string };
  speed: number; // m/s
  jump: number; // jump velocity
}

export const CHARACTERS: CharDef[] = [
  {
    id: "rhea",
    name: "RHEA",
    tag: "PLAYER 001",
    color: "#9FE38A",
    bg: "#12F999",
    ability: { id: "doubleJump", name: "DOUBLE JUMP", text: "Jump again in the air to reach high rooftops." },
    speed: 6.4,
    jump: 9,
  },
  {
    id: "noir",
    name: "NOIR WALLET",
    tag: "PLAYER 002",
    color: "#7FF0C0",
    bg: "#1AF599",
    ability: { id: "nightVision", name: "CARD VISION", text: "Goggles on: every box that holds a memory card glows green." },
    speed: 6.2,
    jump: 9,
  },
  {
    id: "meteora",
    name: "METEORA WALLET",
    tag: "PLAYER 003",
    color: "#B79BFF",
    bg: "#461AED",
    ability: { id: "dash", name: "DASH", text: "A fast burst forward. Cross the city in no time." },
    speed: 6.6,
    jump: 9,
  },
  {
    id: "naxweb3",
    name: "NAXWEB3",
    tag: "PLAYER 004",
    color: "#FF9A3C",
    bg: "#CE5D01",
    ability: { id: "radar", name: "GOLD RADAR", text: "The gold chain points to the nearest memory card you have not found." },
    speed: 6.8,
    jump: 9,
  },
];

export const charById = (id: string): CharDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

export type GameId = "run" | "bomb" | "breaker" | "flip";

export interface CardDef {
  id: string;
  game: GameId;
  title: string;
  color: string; // card body colour
  dark: string; // darker shade for the edges
  blurb: string;
  stars: [number, number, number]; // score needed for 1, 2, 3 stars
}

export const CARDS: CardDef[] = [
  { id: "purple", game: "run", title: "NULL RUN", color: "#9B4DFF", dark: "#5B1FB0", blurb: "Run the subway platform. Tap to jump, hold to jump higher.", stars: [300, 800, 1500] },
  { id: "orange", game: "bomb", title: "BOMB DODGE", color: "#FF7A1A", dark: "#B04A00", blurb: "Bombs fall from the sky. Dodge them and grab the stars.", stars: [20, 45, 80] },
  { id: "green", game: "breaker", title: "NULL BREAKER", color: "#2FD27A", dark: "#147A43", blurb: "Bounce the ball and break every brick.", stars: [400, 1200, 2400] },
  { id: "blue", game: "flip", title: "MEMORY FLIP", color: "#2F7BFF", dark: "#1745A8", blurb: "Flip the cards and match the pairs. Fewer moves, more points.", stars: [300, 600, 850] },
];
export const cardById = (id: string) => CARDS.find((c) => c.id === id)!;

// ---------- the boxes hidden around the city ----------
// Each hunt fills the boxes again: most are empty (some hold coins), a few hold a memory card.
export type BoxContent = { kind: "empty" } | { kind: "coins"; n: number } | { kind: "card"; card: string };

export function rng(seed: number) {
  let t = seed >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Contents for `count` boxes. Every card colour appears at least once, plus a few random extra cards. */
export function fillBoxes(count: number, seed: number): BoxContent[] {
  const r = rng(seed);
  const out: BoxContent[] = [];
  for (let i = 0; i < count; i++) out.push(r() < 0.45 ? { kind: "coins", n: 1 + Math.floor(r() * 5) } : { kind: "empty" });
  const slots = [...Array(count).keys()].sort(() => r() - 0.5);
  const extra = 2 + Math.floor(r() * 3);
  const cards = [...CARDS.map((c) => c.id), ...Array.from({ length: extra }, () => CARDS[Math.floor(r() * CARDS.length)].id)];
  cards.forEach((id, i) => {
    if (i < slots.length) out[slots[i]] = { kind: "card", card: id };
  });
  return out;
}

export interface CardSave {
  found: boolean;
  best: number;
  stars: number;
}

export interface Save {
  v: 1;
  char: CharId;
  cards: Record<string, CardSave & { copies: number }>;
  coins: number;
  hunt: number; // seed of the current box hunt
  opened: number[]; // boxes opened in this hunt
  playedIntro: boolean;
  stats: { boxes: number; driven: number; pickups: number; played: number };
  quests: string[]; // finished quest ids
  owned: string[]; // shop items bought
  scannerHunt: number; // hunt seed the card scanner was bought for
}

const KEY = "nulls-memory-hunt-v1";

export function newSave(char: CharId = "rhea"): Save {
  return {
    v: 1,
    char,
    cards: Object.fromEntries(CARDS.map((c) => [c.id, { found: false, best: 0, stars: 0, copies: 0 }])),
    coins: 0,
    hunt: Math.floor(Math.random() * 1e9),
    opened: [],
    playedIntro: false,
    stats: { boxes: 0, driven: 0, pickups: 0, played: 0 },
    quests: [],
    owned: [],
    scannerHunt: -1,
  };
}

const num = (x: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(Number(x) || 0)));

export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    const base = newSave(charById(s.char).id);
    for (const c of CARDS) {
      const x = s.cards?.[c.id];
      if (x) base.cards[c.id] = { found: !!x.found, best: num(x.best, 0, 1e9), stars: num(x.stars, 0, 3), copies: num(x.copies, 0, 999) };
    }
    base.coins = num(s.coins, 0, 1e9);
    if (Number.isFinite(s.hunt)) base.hunt = num(s.hunt, 0, 2 ** 31);
    base.opened = Array.isArray(s.opened) ? s.opened.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 500) : [];
    base.playedIntro = !!s.playedIntro;
    for (const k of ["boxes", "driven", "pickups", "played"] as const) base.stats[k] = num(s.stats?.[k], 0, 1e9);
    if (Array.isArray(s.quests)) base.quests = s.quests.filter((q: unknown) => typeof q === "string" && QUESTS.some((x) => x.id === q));
    if (Array.isArray(s.owned)) base.owned = s.owned.filter((q: unknown) => typeof q === "string" && SHOP.some((x) => x.id === q));
    if (Number.isFinite(s.scannerHunt)) base.scannerHunt = Math.floor(s.scannerHunt);
    return base;
  } catch {
    return null;
  }
}

export function storeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode: progress lives for this visit only
  }
}

export function eraseSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to erase
  }
}

export function starsFor(card: CardDef, score: number): number {
  return card.stars.filter((t) => score >= t).length;
}

export function recordScore(s: Save, cardId: string, score: number): { save: Save; newBest: boolean; stars: number } {
  const card = CARDS.find((c) => c.id === cardId)!;
  const prev = s.cards[cardId];
  const stars = starsFor(card, score);
  const next: Save = { ...s, stats: { ...s.stats, played: s.stats.played + 1 }, cards: { ...s.cards, [cardId]: { ...prev, found: true, best: Math.max(prev.best, score), stars: Math.max(prev.stars, stars) } } };
  return { save: next, newBest: score > prev.best, stars };
}

export const foundCount = (s: Save) => CARDS.filter((c) => s.cards[c.id]?.found).length;

/** Open box i of the current hunt and apply what is inside. */
export function openBox(s: Save, i: number, content: BoxContent): Save {
  if (s.opened.includes(i)) return s;
  const next: Save = { ...s, opened: [...s.opened, i], stats: { ...s.stats, boxes: s.stats.boxes + 1 } };
  if (content.kind === "coins") next.coins = s.coins + content.n;
  if (content.kind === "card") {
    const prev = s.cards[content.card];
    next.cards = { ...s.cards, [content.card]: { ...prev, found: true, copies: prev.copies + 1 } };
    if (prev.found) next.coins += 10; // a duplicate card is worth some coins
  }
  return next;
}

/** Sleeping in the Game House starts a new hunt: every box is closed and refilled. */
export function newHunt(s: Save): Save {
  return { ...s, hunt: (s.hunt * 48271 + 11) % 2147483647, opened: [] };
}

// ---------- quests ----------
export interface Quest {
  id: string;
  title: string;
  reward: number;
  progress(s: Save): [number, number];
}
const stars3 = (s: Save) => CARDS.filter((c) => s.cards[c.id].stars >= 3).length;
export const QUESTS: Quest[] = [
  { id: "box1", title: "Open your first box", reward: 5, progress: (s) => [s.stats.boxes, 1] },
  { id: "card1", title: "Find a memory card", reward: 10, progress: (s) => [foundCount(s), 1] },
  { id: "play1", title: "Play a card on the Gameboy", reward: 10, progress: (s) => [s.stats.played, 1] },
  { id: "drive", title: "Drive 500 metres", reward: 15, progress: (s) => [Math.floor(s.stats.driven), 500] },
  { id: "coins", title: "Pick up 25 street coins", reward: 15, progress: (s) => [s.stats.pickups, 25] },
  { id: "box20", title: "Open 20 boxes", reward: 20, progress: (s) => [s.stats.boxes, 20] },
  { id: "star3", title: "Earn 3 stars on a card", reward: 30, progress: (s) => [stars3(s), 1] },
  { id: "all4", title: "Find all 4 memory cards", reward: 50, progress: (s) => [foundCount(s), 4] },
  { id: "drive5", title: "Drive 5 kilometres", reward: 40, progress: (s) => [Math.floor(s.stats.driven), 5000] },
  { id: "master", title: "Earn 3 stars on every card", reward: 100, progress: (s) => [stars3(s), 4] },
];
/** Pay out every quest that just got finished. */
export function checkQuests(s: Save): { save: Save; done: Quest[] } {
  const done = QUESTS.filter((q) => !s.quests.includes(q.id) && q.progress(s)[0] >= q.progress(s)[1]);
  if (!done.length) return { save: s, done };
  return { save: { ...s, quests: [...s.quests, ...done.map((q) => q.id)], coins: s.coins + done.reduce((a, q) => a + q.reward, 0) }, done };
}
export const currentQuest = (s: Save) => QUESTS.find((q) => !s.quests.includes(q.id)) ?? null;

// ---------- shop ----------
export interface ShopItem {
  id: string;
  title: string;
  text: string;
  price: number;
  repeat?: boolean;
}
export const SHOP: ShopItem[] = [
  { id: "scanner", title: "CARD SCANNER", text: "Marks every box that holds a memory card on your map until you sleep.", price: 15, repeat: true },
  { id: "sneakers", title: "TURBO SNEAKERS", text: "Run 15% faster, forever.", price: 40 },
  { id: "gold", title: "GOLD GAMEBOY", text: "A shiny golden shell for the Gameboy.", price: 60 },
];
export const scannerOn = (s: Save) => s.scannerHunt === s.hunt;
export function buy(s: Save, id: string): Save | null {
  const it = SHOP.find((x) => x.id === id);
  if (!it || s.coins < it.price) return null;
  if (id === "scanner") return scannerOn(s) ? null : { ...s, coins: s.coins - it.price, scannerHunt: s.hunt };
  if (s.owned.includes(id)) return null;
  return { ...s, coins: s.coins - it.price, owned: [...s.owned, id] };
}
