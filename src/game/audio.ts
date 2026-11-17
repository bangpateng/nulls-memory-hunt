// Chiptune sound, Gameboy style: two pulse channels, a triangle bass and noise drums.
let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, fxBus: GainNode;
let noise: AudioBuffer;
const st = { music: true, sfx: true };
try {
  const s = JSON.parse(localStorage.getItem("nulls-audio") || "{}");
  if (typeof s.music === "boolean") st.music = s.music;
  if (typeof s.sfx === "boolean") st.sfx = s.sfx;
} catch {
  // defaults
}
export const audioState = () => ({ ...st });
export function setAudio(k: "music" | "sfx", on: boolean) {
  st[k] = on;
  try {
    localStorage.setItem("nulls-audio", JSON.stringify(st));
  } catch {
    // ignore
  }
  if (k === "music") on ? startMusic() : stopMusic();
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.42;
  musicBus.connect(master);
  fxBus = ctx.createGain();
  fxBus.gain.value = 0.6;
  fxBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (song && st.music) startMusic();
}

const pulseWaves = new Map<number, PeriodicWave>();
function pulse(duty: number) {
  let w = pulseWaves.get(duty);
  if (!w && ctx) {
    const n = 32,
      re = new Float32Array(n),
      im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = ((2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty));
    w = ctx.createPeriodicWave(re, im);
    pulseWaves.set(duty, w);
  }
  return w!;
}

function note(freq: number, start: number, dur: number, vol: number, kind: "p12" | "p25" | "p50" | "tri", bus: GainNode, slide?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  if (kind === "tri") o.type = "triangle";
  else o.setPeriodicWave(pulse(kind === "p12" ? 0.125 : kind === "p25" ? 0.25 : 0.5));
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.setValueAtTime(vol, start + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(bus);
  o.start(start);
  o.stop(start + dur + 0.02);
}
function hiss(start: number, dur: number, vol: number, bus: GainNode, hp = 6000) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(start, Math.random() * 0.5);
  s.stop(start + dur);
}
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- songs: 16 steps per bar, notes as MIDI numbers, "." rests ----------
interface Song {
  bpm: number;
  lead: (number | null)[]; // one entry per 8th note
  harm?: (number | null)[];
  bass: (number | null)[];
  drums: string; // k = kick, s = snare, h = hat per 8th
  leadWave: "p12" | "p25" | "p50";
}
const seq = (s: string) => s.trim().split(/\s+/).map((x) => (x === "." ? null : Number(x)));
const SONGS: Record<string, Song> = {
  title: {
    bpm: 112,
    leadWave: "p25",
    lead: seq("76 . 79 . 83 . 81 79 76 . 74 . 72 . 74 76 . . 79 . 76 . 74 72 . 69 . . . . 72 . 74 . 76 . 79 . 81 . 83 . 84 . 83 81 . 79 . . 76 . 79 81 . 79 76 74 72 . . . . ."),
    bass: seq("45 . 45 . 52 . 45 . 41 . 41 . 48 . 41 . 48 . 48 . 55 . 48 . 43 . 43 . 50 . 43 . 45 . 45 . 52 . 45 . 41 . 41 . 48 . 41 . 48 . 48 . 55 . 48 . 43 . 47 . 50 . 52 ."),
    drums: "k.h.s.h.k.h.s.hh",
    harm: seq("64 . . . 64 . . . 60 . . . 60 . . . 64 . . . 64 . . . 62 . . . 62 . . ."),
  },
  city: {
    bpm: 98,
    leadWave: "p50",
    lead: seq("69 . . 72 . . 74 . 76 . . 74 . 72 69 . 67 . . 69 . . 72 . 74 . . . . . . . 69 . . 72 . . 74 . 79 . . 76 . 74 72 . 74 . . 72 . . 69 . 67 . . . . . . ."),
    bass: seq("45 . 57 . 45 . 57 . 41 . 53 . 41 . 53 . 43 . 55 . 43 . 55 . 40 . 52 . 40 . 52 ."),
    drums: "k.h.s.hkk.h.s.h.",
  },
  house: {
    bpm: 84,
    leadWave: "p12",
    lead: seq("72 . 76 . 79 . 76 . 77 . 81 . 79 . . . 76 . 79 . 84 . 83 . 81 . 79 . 77 . . . 72 . 76 . 79 . 76 . 74 . 77 . 76 . 74 . 72 . . . . . . . . . . . . . . ."),
    bass: seq("48 . . . 55 . . . 53 . . . 55 . . . 48 . . . 52 . . . 50 . . . 55 . . ."),
    drums: "k.h.h.h.s.h.h.h.",
  },
  game: {
    bpm: 140,
    leadWave: "p25",
    lead: seq("72 72 . 76 . 79 . 76 77 77 . 81 . 79 . 77 76 76 . 79 . 84 . 83 81 . 79 . 77 . 76 ."),
    bass: seq("48 . 48 . 55 . 48 . 53 . 53 . 60 . 53 . 52 . 52 . 59 . 52 . 50 . 55 . 57 . 59 ."),
    drums: "khskkhsh",
  },
};

let song: Song | null = null;
let songName = "";
let step = 0;
let nextT = 0;
let timer = 0;

// ---------- the radio: original hip-hop instrumentals, generated live ----------
type Kind = "boom" | "trap" | "lofi" | "drill" | "west";
interface Beat {
  name: string;
  bpm: number;
  swing: number;
  kind: Kind;
  root: number; // MIDI note of the key (minor)
  prog: number[]; // scale degree of each bar's chord (0 = i, 3 = iv, 5 = VI ...)
  kick: string;
  snare: string;
  hat: string; // x closed, o open, r roll
  seed: number;
  keys: "ep" | "pad" | "bell" | "pluck";
}
const BEATS: Beat[] = [
  { name: "Null Block Anthem", bpm: 90, swing: 0.16, kind: "boom", root: 45, prog: [0, 0, 5, 4], kick: "x..x......x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.xo", seed: 11, keys: "ep" },
  { name: "Memory Card Flow", bpm: 140, swing: 0, kind: "trap", root: 41, prog: [0, 5, 3, 4], kick: "x.....x...x.....", snare: "........x.......", hat: "x.x.x.xrx.x.xrxr", seed: 23, keys: "bell" },
  { name: "Do Not Erase", bpm: 82, swing: 0.2, kind: "lofi", root: 48, prog: [0, 3, 5, 4], kick: "x......x..x.....", snare: "....x.......x..x", hat: "x.x.x.x.x.x.x.x.", seed: 37, keys: "pad" },
  { name: "Player Select", bpm: 96, swing: 0.12, kind: "west", root: 43, prog: [0, 0, 3, 0], kick: "x..x..x...x..x..", snare: "....x.......x...", hat: "x.xxx.xxx.xxx.xo", seed: 41, keys: "pluck" },
  { name: "Near Side Drill", bpm: 142, swing: 0, kind: "drill", root: 40, prog: [0, 5, 0, 4], kick: "x..x...x..x.....", snare: "......x.......x.", hat: "x.xx.x.xrx.xx.xr", seed: 53, keys: "bell" },
  { name: "Gameboy Cypher", bpm: 88, swing: 0.18, kind: "boom", root: 47, prog: [0, 4, 5, 3], kick: "x.....x.x.....x.", snare: "....x.......x...", hat: "x.x.x.xox.x.x.x.", seed: 67, keys: "pluck" },
  { name: "Cardboard Gold", bpm: 132, swing: 0, kind: "trap", root: 38, prog: [0, 0, 5, 5], kick: "x..x......x..x..", snare: "........x.......", hat: "xrx.x.x.xrx.x.xr", seed: 71, keys: "pad" },
  { name: "Slow Bus Home", bpm: 76, swing: 0.22, kind: "lofi", root: 50, prog: [5, 4, 0, 0], kick: "x.........x.x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.xox.", seed: 83, keys: "ep" },
  { name: "Wallet Talk", bpm: 100, swing: 0.1, kind: "west", root: 45, prog: [0, 3, 0, 4], kick: "x..x....x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", seed: 97, keys: "ep" },
  { name: "Station Freestyle", bpm: 93, swing: 0.17, kind: "boom", root: 42, prog: [0, 5, 3, 4], kick: "x.x.......xx....", snare: "....x.......x.x.", hat: "x.x.xxx.x.x.xxxo", seed: 101, keys: "bell" },
];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 3, 5, 7, 10];
let beat: Beat | null = null;
let beatIdx = Math.floor(Math.random() * BEATS.length);
let radioOn = false;
let bStep = 0;
let motif: (number | null)[] = [];
let bassPat: (number | null)[] = [];
let wet: GainNode | null = null;
const listeners = new Set<(name: string) => void>();
export const onTrack = (f: (name: string) => void) => (listeners.add(f), () => void listeners.delete(f));
export const trackName = () => (radioOn && beat ? beat.name : "");
export const trackList = () => BEATS.map((b) => b.name);

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function loadBeat(i: number) {
  beatIdx = ((i % BEATS.length) + BEATS.length) % BEATS.length;
  beat = BEATS[beatIdx];
  bStep = 0;
  const r = rnd(beat.seed);
  // a two-bar melodic hook on the minor pentatonic, answered with a variation
  const hook: (number | null)[] = [];
  let deg = Math.floor(r() * 5);
  const dens = beat.kind === "lofi" ? 0.28 : beat.kind === "trap" || beat.kind === "drill" ? 0.34 : 0.4;
  for (let k = 0; k < 32; k++) {
    if (k % 4 === 0 ? r() < 0.75 : r() < dens) {
      deg = Math.max(0, Math.min(9, deg + Math.floor(r() * 5) - 2));
      hook.push(PENTA[deg % 5] + 12 * Math.floor(deg / 5));
    } else hook.push(null);
  }
  motif = [...hook, ...hook.slice(0, 16), ...hook.slice(16).map((n, k) => (k > 8 && n !== null ? n + (r() < 0.5 ? 2 : -2) : n))];
  // bass: follows the kick, with slides and octave jumps for the 808 styles
  bassPat = [];
  for (let k = 0; k < 16; k++) {
    const onKick = beat.kick[k] === "x";
    bassPat.push(onKick ? (r() < 0.2 ? 12 : 0) : r() < 0.08 ? 7 : null);
  }
  for (const f of listeners) f(beat.name);
}
export function playTrack(i: number) {
  loadBeat(i);
  if (ctx) nextT = ctx.currentTime + 0.08;
}
export function nextTrack(d = 1) {
  loadBeat(beatIdx + d);
  if (ctx) nextT = ctx.currentTime + 0.08;
}

function voice(type: OscillatorType, f: number, t: number, dur: number, vol: number, o: { lp?: number; slide?: number; attack?: number; detune?: number; bus?: AudioNode } = {}) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur * 0.6);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = "lowpass";
    fl.frequency.value = o.lp;
    node.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(o.bus ?? musicBus);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}
function band(t: number, dur: number, vol: number, freq: number, q = 0.8) {
  if (!ctx) return;
  const sr = ctx.createBufferSource();
  sr.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sr.connect(f);
  f.connect(g);
  g.connect(musicBus);
  sr.start(t, Math.random() * 0.5);
  sr.stop(t + dur);
}
function radioTick() {
  if (!ctx || !beat) return;
  if (!wet) {
    // a touch of echo on the melody
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    wet = ctx.createGain();
    wet.gain.value = 0.5;
    wet.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(musicBus);
  }
  const b = beat;
  const sd = 60 / b.bpm / 4;
  while (nextT < ctx.currentTime + 0.25) {
    const s16 = bStep % 16,
      bar = Math.floor(bStep / 16);
    const t = nextT + (s16 % 2 ? b.swing * sd : 0);
    const sect = Math.floor(bar / 4) % 8; // 4-bar sections: intro, verse, verse, hook, break, verse, hook, outro
    const drums = sect !== 0 && sect !== 4;
    const melody = sect === 0 || sect === 3 || sect === 4 || sect === 6 || sect === 7;
    const chordDeg = b.prog[bar % 4];
    const chordRoot = b.root + MINOR[chordDeg % 7];
    const sub = b.kind === "trap" || b.kind === "drill" || b.kind === "west";
    if (drums || (sect === 4 && bar % 4 === 3 && s16 >= 8)) {
      if (b.kick[s16] === "x") {
        voice("sine", 150, t, 0.26, 0.95, { slide: 42 });
        if (b.kind === "boom" || b.kind === "lofi") band(t, 0.03, 0.2, 3000);
      }
      if (b.snare[s16] === "x") {
        if (b.kind === "trap" || b.kind === "drill") {
          for (const k of [0, 0.012, 0.024]) band(t + k, 0.05, 0.3, 1300, 1.2);
          band(t + 0.03, 0.2, 0.22, 1500, 0.7);
        } else {
          band(t, 0.17, 0.42, 1900, 0.6);
          voice("triangle", 190, t, 0.09, 0.3, { slide: 150 });
        }
      }
      const h = b.hat[s16];
      if (h === "x") hiss(t, 0.035, s16 % 4 === 0 ? 0.1 : 0.065, musicBus, 8500);
      if (h === "o") hiss(t, 0.2, 0.08, musicBus, 7500);
      if (h === "r") for (let k = 0; k < 3; k++) hiss(t + (k * sd) / 3, 0.025, 0.05 + k * 0.02, musicBus, 9000);
      // bass
      const bn = bassPat[s16];
      if (bn !== null) {
        const f = hz(chordRoot - 12 + (sub ? 0 : 0) + (bn === 12 && !sub ? 12 : bn === 7 ? 7 : 0) - (chordRoot > 47 ? 12 : 0));
        if (sub) voice("sine", f * (bn === 12 ? 1.5 : 1), t, sd * 5, 0.6, { slide: f, attack: 0.012 }), voice("triangle", f, t, sd * 3, 0.12, { lp: 500 });
        else voice("triangle", f, t, sd * 2.6, 0.5, { lp: 700 }), voice("sine", f, t, sd * 2.6, 0.3);
      }
    }
    // chords
    const tones = [0, 2, 4, 6].map((k) => {
      const d = chordDeg + k;
      return b.root + 12 + MINOR[d % 7] + 12 * Math.floor(d / 7);
    });
    if (b.keys === "pad") {
      if (s16 === 0) for (const n of tones) for (const dt of [-8, 8]) voice("sawtooth", hz(n), t, sd * 17, 0.035, { lp: 650, attack: 0.25, detune: dt });
    } else if (b.keys === "ep") {
      if (s16 === 0 || s16 === 7 || (s16 === 10 && bar % 2 === 1)) for (const n of tones) voice("sine", hz(n), t, sd * 6, 0.075, { attack: 0.008 }), voice("triangle", hz(n + 12), t, sd * 2, 0.02);
    } else if (b.keys === "pluck") {
      if (s16 % 4 === 0 || s16 === 6 || s16 === 11) voice("triangle", hz(tones[[0, 2, 1, 3][Math.floor(s16 / 4)]] ), t, sd * 2.2, 0.11, { lp: 2200 });
    } else {
      if (s16 % 2 === 0 && (s16 < 12 || bar % 2 === 0)) {
        const n = tones[[0, 1, 2, 1, 3, 2, 1, 2][s16 / 2]];
        voice("sine", hz(n + 12), t, sd * 4, 0.07);
        voice("sine", hz(n + 31), t, sd * 1.2, 0.015);
      }
    }
    // the hook
    const m = motif[bStep % 64];
    if (melody && m !== null && wet) {
      const f = hz(b.root + 24 + m);
      if (b.kind === "lofi") voice("triangle", f, t, sd * 3, 0.1, { lp: 1800, bus: wet }), voice("triangle", f, t, sd * 3, 0.1, { lp: 1800 });
      else if (b.kind === "west") voice("sawtooth", f * 2, t, sd * 2.5, 0.035, { lp: 3000, slide: f * 2 * 1.002, bus: wet }), voice("sine", f * 2, t, sd * 2.5, 0.07);
      else voice("square", f, t, sd * 1.8, 0.035, { lp: 1900, bus: wet }), voice("square", f, t, sd * 1.8, 0.04, { lp: 1900 });
    }
    nextT += sd;
    bStep++;
    if (bStep >= 16 * 32) loadBeat(beatIdx + 1); // 32 bars, then the next record
  }
}

function tick() {
  if (radioOn) return radioTick();
  if (!ctx || !song) return;
  const eighth = 60 / song.bpm / 2;
  while (nextT < ctx.currentTime + 0.25) {
    const s = song;
    const l = s.lead[step % s.lead.length];
    if (l) note(hz(l), nextT, eighth * 0.9, 0.12, s.leadWave, musicBus);
    if (s.harm) {
      const h = s.harm[step % s.harm.length];
      if (h) note(hz(h), nextT, eighth * 3.5, 0.05, "p12", musicBus);
    }
    const b = s.bass[step % s.bass.length];
    if (b) note(hz(b), nextT, eighth * 0.95, 0.22, "tri", musicBus);
    const d = s.drums[step % s.drums.length];
    if (d === "k") note(140, nextT, 0.12, 0.35, "tri", musicBus, 45);
    if (d === "s") hiss(nextT, 0.12, 0.12, musicBus, 1800);
    if (d === "h") hiss(nextT, 0.03, 0.05, musicBus, 8000);
    nextT += eighth;
    step++;
  }
}
function startMusic() {
  if (!ctx || !song || !st.music) return;
  if (!timer) {
    nextT = ctx.currentTime + 0.05;
    timer = window.setInterval(tick, 60);
  }
}
function stopMusic() {
  if (timer) clearInterval(timer);
  timer = 0;
}
export function music(name: keyof typeof SONGS | "off") {
  if (name === "off") {
    song = null;
    songName = "";
    radioOn = false;
    stopMusic();
    for (const f of listeners) f("");
    return;
  }
  // everything except the Gameboy itself plays the hip-hop radio, which keeps going between screens
  if (name !== "game") {
    song = SONGS.title;
    songName = "radio";
    if (!radioOn) {
      radioOn = true;
      if (!beat) loadBeat(beatIdx);
      else for (const f of listeners) f(beat.name);
      if (ctx) nextT = ctx.currentTime + 0.08;
    }
    startMusic();
    return;
  }
  radioOn = false;
  for (const f of listeners) f("");
  if (songName === name) return;
  songName = name;
  song = SONGS[name];
  step = 0;
  if (ctx) nextT = ctx.currentTime + 0.05;
  startMusic();
}

// ---------- sound effects ----------
const on = () => !!ctx && st.sfx;
const now = () => ctx!.currentTime;
// engine hum while driving: pass the speed in m/s, or null to switch it off
let eng: { o: OscillatorNode; o2: OscillatorNode; g: GainNode } | null = null;
export function engine(v: number | null) {
  if (!ctx) return;
  if (v === null || !st.sfx) {
    if (eng) {
      eng.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      const e = eng;
      eng = null;
      setTimeout(() => (e.o.stop(), e.o2.stop()), 400);
    }
    return;
  }
  if (!eng) {
    const o = ctx.createOscillator(),
      o2 = ctx.createOscillator(),
      g = ctx.createGain(),
      f = ctx.createBiquadFilter();
    o.type = "sawtooth";
    o2.type = "square";
    f.type = "lowpass";
    f.frequency.value = 420;
    g.gain.value = 0;
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(fxBus);
    o.start();
    o2.start();
    eng = { o, o2, g };
  }
  const a = Math.abs(v);
  const hzv = 42 + (a % 9) * 7 + a * 2.2; // climbs and "shifts gear" every 9 m/s
  eng.o.frequency.setTargetAtTime(hzv, ctx.currentTime, 0.05);
  eng.o2.frequency.setTargetAtTime(hzv / 2, ctx.currentTime, 0.05);
  eng.g.gain.setTargetAtTime(0.07 + Math.min(0.08, a * 0.004), ctx.currentTime, 0.1);
}

// soft city hum while outside
let amb: { src: AudioBufferSourceNode; g: GainNode } | null = null;
export function ambience(onNow: boolean) {
  if (!ctx) return;
  if (onNow && st.sfx && !amb) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.11, ctx.currentTime, 0.8);
    src.connect(f);
    f.connect(g);
    g.connect(fxBus);
    src.start();
    amb = { src, g };
  } else if ((!onNow || !st.sfx) && amb) {
    amb.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    const a = amb;
    amb = null;
    setTimeout(() => a.src.stop(), 1500);
  }
}

export const sfx = {
  /** metal crunch; k = 0..1 how hard */
  crash(k = 1) {
    if (!on()) return;
    const v = 0.15 + Math.min(1, k) * 0.35;
    hiss(now(), 0.35, v, fxBus, 300);
    hiss(now() + 0.03, 0.18, v * 0.8, fxBus, 2500);
    note(hz(34), now(), 0.3, v, "tri", fxBus, hz(22));
    note(hz(52), now() + 0.02, 0.12, v * 0.5, "p50", fxBus, hz(40));
    if (k > 0.6) for (let i = 0; i < 4; i++) note(hz(96 + i * 5), now() + 0.08 + i * 0.045, 0.05, 0.05, "p12", fxBus); // glass
  },
  skid() {
    if (on()) hiss(now(), 0.3, 0.12, fxBus, 1800), note(hz(84), now(), 0.3, 0.035, "p25", fxBus, hz(80));
  },
  step() {
    if (on()) hiss(now(), 0.05, 0.05, fxBus, 900);
  },
  /** another driver's horn, vol 0..1 by distance */
  honk(vol = 1) {
    if (on()) note(hz(64), now(), 0.28, 0.12 * vol, "p50", fxBus), note(hz(60), now(), 0.28, 0.12 * vol, "p50", fxBus);
  },
  yell() {
    if (on()) note(hz(74), now(), 0.16, 0.07, "p25", fxBus, hz(82));
  },
  horn() {
    if (on()) note(hz(69), now(), 0.35, 0.18, "p50", fxBus), note(hz(65), now(), 0.35, 0.18, "p50", fxBus);
  },
  blip() {
    if (on()) note(hz(84), now(), 0.05, 0.12, "p50", fxBus);
  },
  select() {
    if (on()) note(hz(79), now(), 0.06, 0.12, "p25", fxBus), note(hz(86), now() + 0.06, 0.08, 0.12, "p25", fxBus);
  },
  back() {
    if (on()) note(hz(72), now(), 0.06, 0.1, "p25", fxBus), note(hz(67), now() + 0.06, 0.08, 0.1, "p25", fxBus);
  },
  jump() {
    if (on()) note(hz(64), now(), 0.14, 0.12, "p25", fxBus, hz(79));
  },
  jump2() {
    if (on()) note(hz(72), now(), 0.14, 0.12, "p12", fxBus, hz(88));
  },
  land() {
    if (on()) hiss(now(), 0.08, 0.1, fxBus, 900);
  },
  dash() {
    if (on()) hiss(now(), 0.25, 0.2, fxBus, 2500), note(hz(60), now(), 0.2, 0.08, "p50", fxBus, hz(84));
  },
  toggle(onState: boolean) {
    if (on()) note(hz(onState ? 76 : 69), now(), 0.08, 0.1, "p12", fxBus), note(hz(onState ? 83 : 64), now() + 0.08, 0.1, 0.1, "p12", fxBus);
  },
  coin() {
    if (on()) note(hz(83), now(), 0.07, 0.12, "p25", fxBus), note(hz(88), now() + 0.07, 0.18, 0.12, "p25", fxBus);
  },
  empty() {
    if (on()) note(hz(55), now(), 0.15, 0.1, "p50", fxBus, hz(48)), hiss(now(), 0.2, 0.06, fxBus, 1500);
  },
  cardFound() {
    if (!on()) return;
    [72, 76, 79, 84, 79, 84].forEach((m, i) => note(hz(m), now() + i * 0.09, 0.12, 0.13, "p25", fxBus));
    note(hz(48), now(), 0.6, 0.2, "tri", fxBus);
  },
  door() {
    if (on()) note(hz(60), now(), 0.08, 0.1, "p50", fxBus), note(hz(67), now() + 0.08, 0.12, 0.1, "p50", fxBus);
  },
  bump() {
    if (on()) note(hz(40), now(), 0.25, 0.3, "tri", fxBus, hz(28)), hiss(now(), 0.2, 0.2, fxBus, 600);
  },
  hit() {
    if (on()) hiss(now(), 0.25, 0.25, fxBus, 400), note(hz(45), now(), 0.3, 0.2, "p50", fxBus, hz(30));
  },
  point() {
    if (on()) note(hz(88), now(), 0.05, 0.08, "p12", fxBus);
  },
  gameOver() {
    if (!on()) return;
    [72, 67, 64, 60].forEach((m, i) => note(hz(m), now() + i * 0.16, 0.18, 0.13, "p50", fxBus));
  },
  win() {
    if (!on()) return;
    [72, 76, 79, 84].forEach((m, i) => note(hz(m), now() + i * 0.1, 0.14, 0.13, "p25", fxBus));
  },
};
