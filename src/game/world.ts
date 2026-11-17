// The running game: player on foot or behind the wheel, camera, physics, boxes, traffic that obeys
// the lights, pedestrians, day/night and weather, friends in the plaza and the Game House.
import * as THREE from "three";
import { buildCharacter, type CharModel } from "./characters";
import { buildCity, HOUSE_DOOR, LANE, ROAD_CENTERS, signalFor, SW, type City, type Collider } from "./city";
import { buildBox, buildCard, buildInterior, INTERIOR_ORIGIN, type BoxModel, type Interior } from "./props";
import { buildCar, type CarModel } from "./vehicles";
import { Pedestrians } from "./peds";
import { CARDS, charById, fillBoxes, type BoxContent, type CharId, type Save } from "./data";
import { consume, input } from "./input";
import { ambience, engine, sfx } from "./audio";
import { rng } from "./data";
import { blockMin, BLOCK } from "./city";
import { buildComposer, Rain, Sky, skyAt, skyEnvironment, type SkyState } from "./fx";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface WorldHud {
  prompt: string | null;
  inside: boolean;
  ability: boolean;
  radar: { dist: number; angle: number } | null; // angle relative to the camera, radians
  clock: string;
  speed: number | null; // km/h while driving
  rain: boolean;
  carPrompt: boolean;
}

export interface WorldEvents {
  onHud(h: WorldHud): void;
  onBox(index: number, content: BoxContent): void;
  onInteract(id: "gameboy" | "bed" | "wardrobe" | "shop"): void;
  onPickup(n: number): void;
  onDrive(metres: number): void;
  onTalk(char: CharId): void;
  onToast(text: string): void;
}

interface BoxState {
  model: BoxModel;
  content: BoxContent;
  open: boolean;
  t: number;
  pop: THREE.Object3D | null;
  popT: number;
}

interface TrafficCar {
  m: CarModel;
  axis: "x" | "z";
  dir: 1 | -1;
  lane: number;
  pos: number;
  cruise: number;
  v: number;
  brake: boolean;
}
interface ParkedCar {
  m: CarModel;
  x: number;
  z: number;
  h: number;
}
interface Driving {
  m: CarModel;
  x: number;
  z: number;
  y: number;
  h: number;
  v: number;
  steer: number;
}

const GRAV = 24;
const R = 0.38; // player radius
const STEP_UP = 0.45;
const HOUR_SECONDS = 40; // real seconds per game hour

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
  city: City;
  interior: Interior;
  boxes: BoxState[] = [];
  traffic: TrafficCar[] = [];
  parked: ParkedCar[] = [];
  driving: Driving | null = null;
  peds: Pedestrians;
  npcs: { id: CharId; model: CharModel; x: number; z: number; face: number }[] = [];
  player!: CharModel;
  char: CharId;
  pos = new THREE.Vector3(0, SW, 11);
  vel = new THREE.Vector3();
  facing = Math.PI;
  onGround = true;
  jumpsLeft = 1;
  dashT = 0;
  dashCd = 0;
  stunT = 0;
  ability = false;
  inside = false;
  yaw = 0;
  paused = false;
  hour = 17.2;
  day = 0;
  rainOn = false;
  wet = 0;
  sky: Sky;
  rain: Rain;
  composer!: EffectComposer;
  bloom!: UnrealBloomPass;
  hemi: THREE.HemisphereLight;
  lastSafe = new THREE.Vector3(0, SW, 11);
  sun: THREE.DirectionalLight;
  radarArrow: THREE.Mesh;
  private time = 0;
  private envT = 99;
  private envTex: THREE.Texture | null = null;
  private skyState!: SkyState;
  private raf = 0;
  private last = performance.now();
  private hudT = 0;
  private lastPrompt: string | null = "-";
  private events: WorldEvents;
  private camYaw = 0;
  pitch = 0.3;
  private dayT0 = 0;
  fast = false; // turbo sneakers
  scanner = false; // card scanner bought for this hunt
  private coins!: THREE.InstancedMesh;
  private coinPos: THREE.Vector3[] = [];
  private coinGone: boolean[] = [];
  private driveAcc = 0;
  private lastCrash = 0;
  private lastSkid = 0;
  private lastHonk = 0;
  private lastYell = 0;
  private stepAcc = 0;
  private quality: "high" | "low";

  constructor(canvas: HTMLCanvasElement, save: Save, events: WorldEvents, quality: "high" | "low") {
    this.events = events;
    this.quality = quality;
    this.char = save.char;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : 1));
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.fog = new THREE.FogExp2(0xbcd0e2, 0.007);
    this.sky = new Sky();
    this.scene.add(this.sky.group);

    this.hemi = new THREE.HemisphereLight(0xbcd4f0, 0x5a5040, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
    this.sun.castShadow = quality === "high";
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -36;
    sc.right = sc.top = 36;
    sc.near = 1;
    sc.far = 160;
    this.scene.add(this.sun, this.sun.target);
    this.rain = new Rain(quality === "high" ? 2400 : 1000);
    this.rain.mesh.visible = false;
    this.scene.add(this.rain.mesh);

    this.city = buildCity();
    this.scene.add(this.city.group);
    this.interior = buildInterior();
    this.scene.add(this.interior.group);

    for (const spot of this.city.spots) {
      const m = buildBox();
      m.root.position.set(spot.x, spot.y, spot.z);
      m.root.rotation.y = spot.rot;
      this.scene.add(m.root);
      this.boxes.push({ model: m, content: { kind: "empty" }, open: false, t: 0, pop: null, popT: 0 });
    }
    this.setHunt(save);

    // traffic: right-hand drive on every road, both directions
    let k = 0;
    for (const rc of ROAD_CENTERS)
      for (const axis of ["x", "z"] as const)
        for (const dir of [1, -1] as const) {
          for (let n = 0; n < 2; n++) {
            const m = buildCar(k * 3 + n);
            this.scene.add(m.root);
            const lane = axis === "z" ? rc - dir * LANE : rc + dir * LANE;
            const cruise = 9 + ((k * 5 + n * 3) % 6);
            this.traffic.push({ m, axis, dir, lane, pos: -85 + ((k * 53 + n * 89) % 170), cruise, v: cruise, brake: false });
          }
          k++;
        }
    this.city.parkSpots.forEach((p, i) => {
      const m = buildCar(i * 5 + 1);
      m.root.position.set(p.x, 0, p.z);
      m.root.rotation.y = p.rot;
      this.scene.add(m.root);
      this.parked.push({ m, x: p.x, z: p.z, h: p.rot });
    });
    this.peds = new Pedestrians(this.city.walkLoops, quality === "high" ? 70 : 40);
    this.scene.add(this.peds.group);

    // street coins: little trails on sidewalks, crossings and low rooftops
    const cr = rng(777);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const x0 = blockMin(i),
          z0 = blockMin(j);
        for (let k = 0; k < 2; k++) {
          const alongX = cr() < 0.5;
          const off = cr() < 0.5 ? 1.5 : BLOCK - 1.5;
          const st = 3 + cr() * 12;
          for (let n = 0; n < 4; n++) this.coinPos.push(alongX ? new THREE.Vector3(x0 + st + n * 1.6, SW + 0.9, z0 + off) : new THREE.Vector3(x0 + off, SW + 0.9, z0 + st + n * 1.6));
        }
        if (i < 4 && cr() < 0.6) for (let n = 0; n < 3; n++) this.coinPos.push(new THREE.Vector3(x0 + BLOCK + 3 + n * 2, 0.9, z0 + BLOCK + 5));
      }
    for (const sp of this.city.spots) if (sp.roof) for (let n = 0; n < 3; n++) this.coinPos.push(new THREE.Vector3(sp.x - 2 + n * 2, sp.y + 0.9, sp.z + 2.5));
    this.coins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffc62e, metalness: 0.9, roughness: 0.25, emissive: 0x7a5200, emissiveIntensity: 0.9 }),
      this.coinPos.length,
    );
    this.coins.frustumCulled = false;
    this.scene.add(this.coins);
    this.coinGone = this.coinPos.map(() => false);

    const arrowGeo = new THREE.ConeGeometry(0.22, 0.6, 4);
    arrowGeo.rotateX(Math.PI / 2);
    this.radarArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffc23a, toneMapped: false }));
    this.radarArrow.visible = false;
    this.scene.add(this.radarArrow);

    this.setCharacter(save.char);
    const c = buildComposer(this.renderer, this.scene, this.camera, quality === "high");
    this.composer = c.composer;
    this.bloom = c.bloom;
    this.updateEnvironment(0);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize = () => {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth,
      h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 58;
    this.camera.updateProjectionMatrix();
  };

  /** Load the boxes of the save's current hunt. */
  setHunt(save: Save) {
    this.coinGone = this.coinPos.map(() => false);
    const contents = fillBoxes(this.boxes.length, save.hunt);
    this.boxes.forEach((b, i) => {
      b.content = contents[i];
      b.open = save.opened.includes(i);
      b.t = b.open ? 1 : 0;
      b.model.open(b.t);
      if (b.pop) {
        this.scene.remove(b.pop);
        b.pop = null;
      }
    });
  }

  /** Sleeping in the Game House skips to the next morning. */
  sleep() {
    this.day++;
    this.dayT0 = this.time + HOUR_SECONDS * 4 * 1.2; // back to the morning
    this.rainOn = false;
    this.wet = 0;
    this.envT = 99;
  }

  setCharacter(id: CharId) {
    this.char = id;
    if (this.player) this.scene.remove(this.player.root);
    this.player = buildCharacter(id);
    this.scene.add(this.player.root);
    this.player.root.visible = !this.driving;
    this.ability = false;
    for (const n of this.npcs) this.scene.remove(n.model.root);
    this.npcs = [];
    const others = (["rhea", "noir", "meteora", "naxweb3"] as CharId[]).filter((c) => c !== id);
    others.forEach((cid, k) => {
      const s = this.city.npcSpots[k];
      const model = buildCharacter(cid);
      model.root.position.set(s.x, SW, s.z);
      model.root.rotation.y = s.face;
      this.scene.add(model.root);
      this.npcs.push({ id: cid, model, x: s.x, z: s.z, face: s.face });
    });
  }

  updateShelf(save: Save) {
    const shelf = this.interior.shelf;
    shelf.clear();
    CARDS.forEach((c, i) => {
      if (!save.cards[c.id]?.found) return;
      const card = buildCard(c, 0.55);
      card.position.set(-1.8 + i * 1.2, 0.25, 0);
      shelf.add(card);
    });
  }

  enterHouse() {
    this.inside = true;
    this.pos.copy(this.interior.spawn);
    this.vel.set(0, 0, 0);
    this.facing = Math.PI;
    this.yaw = 0;
    this.camera.position.set(INTERIOR_ORIGIN.x, 2.6, INTERIOR_ORIGIN.z + 5.5);
    this.pitch = 0.3;
    sfx.door();
  }
  exitHouse() {
    this.inside = false;
    this.pos.set(HOUSE_DOOR.x, SW, HOUSE_DOOR.z + 1.2);
    this.vel.set(0, 0, 0);
    this.facing = 0;
    this.yaw = 0;
    this.camera.position.set(HOUSE_DOOR.x, 3.5, HOUSE_DOOR.z + 8.4);
    sfx.door();
  }

  private colliders(): Collider[] {
    return this.inside ? this.interior.colliders : this.city.colliders;
  }

  private onSidewalk(x: number, z: number) {
    const m = (v: number) => (((v + 80) % 34) + 34) % 34;
    return x > -80 && x < 80 && z > -80 && z < 80 && m(x) < 24 && m(z) < 24;
  }

  private groundAt(x: number, z: number, y: number, rad = R): number {
    let g = this.inside ? 0 : this.onSidewalk(x, z) ? SW : 0;
    for (const c of this.colliders()) {
      if (x + rad * 0.6 < c.minX || x - rad * 0.6 > c.maxX || z + rad * 0.6 < c.minZ || z - rad * 0.6 > c.maxZ) continue;
      if (c.top <= y + STEP_UP && c.top > g) g = c.top;
    }
    if (!this.inside)
      for (const b of this.boxes) {
        const p = b.model.root.position;
        if (Math.abs(x - p.x) < 0.5 && Math.abs(z - p.z) < 0.5 && p.y + 0.7 <= y + STEP_UP && p.y + 0.7 > g) g = p.y + 0.7;
      }
    return g;
  }

  /** Push a circle out of every collider taller than `y + step`. Returns true if it hit something. */
  private pushCircle(p: { x: number; z: number }, rad: number, y: number, step: number): boolean {
    let hit = false;
    for (const c of this.colliders()) {
      if (c.top <= y + step) continue;
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx,
        dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * rad;
        p.z = cz + (dz / d) * rad;
      } else {
        const opts = [
          [p.x - c.minX, -1, 0],
          [c.maxX - p.x, 1, 0],
          [p.z - c.minZ, 0, -1],
          [c.maxZ - p.z, 0, 1],
        ].sort((a, b) => a[0] - b[0])[0];
        if (opts[1]) p.x = opts[1] < 0 ? c.minX - rad : c.maxX + rad;
        else p.z = opts[2] < 0 ? c.minZ - rad : c.maxZ + rad;
      }
    }
    return hit;
  }

  private carPose(c: TrafficCar): [number, number, number] {
    return c.axis === "x" ? [c.pos, c.lane, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2] : [c.lane, c.pos, c.dir > 0 ? 0 : Math.PI];
  }

  private near():
    | { kind: "box"; i: number }
    | { kind: "door" }
    | { kind: "spot"; id: Interior["spots"][number]["id"]; label: string }
    | { kind: "npc"; id: CharId }
    | null {
    const p = this.pos;
    if (this.inside) {
      for (const s of this.interior.spots) if (Math.hypot(p.x - s.x, p.z - s.z) < 1.5) return { kind: "spot", id: s.id, label: s.label };
      return null;
    }
    let best = -1,
      bd = 1.7;
    this.boxes.forEach((b, i) => {
      if (b.open) return;
      const q = b.model.root.position;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d < bd && Math.abs(p.y - q.y) < 1.6) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) return { kind: "box", i: best };
    if (Math.hypot(p.x - HOUSE_DOOR.x, p.z - HOUSE_DOOR.z) < 1.8) return { kind: "door" };
    for (const n of this.npcs) if (Math.hypot(p.x - n.x, p.z - n.z) < 1.8) return { kind: "npc", id: n.id };
    return null;
  }

  /** The closest car the player could get into, if any. */
  private nearCar(): { parked?: ParkedCar; traffic?: TrafficCar } | null {
    if (this.inside) return null;
    let bd = 3.4,
      out: { parked?: ParkedCar; traffic?: TrafficCar } | null = null;
    for (const p of this.parked) {
      const d = Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
      if (d < bd) (bd = d), (out = { parked: p });
    }
    for (const t of this.traffic) {
      const [x, z] = this.carPose(t);
      const d = Math.hypot(this.pos.x - x, this.pos.z - z);
      if (d < bd && t.v < 3) (bd = d), (out = { traffic: t });
    }
    return out;
  }

  private enterCar(c: { parked?: ParkedCar; traffic?: TrafficCar }) {
    let m: CarModel, x: number, z: number, h: number;
    if (c.parked) {
      ({ m, x, z, h } = c.parked);
      this.parked = this.parked.filter((p) => p !== c.parked);
    } else {
      const t = c.traffic!;
      [x, z, h] = this.carPose(t);
      m = t.m;
      this.traffic = this.traffic.filter((q) => q !== t);
      this.peds.update(0, [{ x, z, r: 4 }], this.pos);
    }
    this.driving = { m, x, z, y: 0, h, v: 0, steer: 0 };
    this.player.root.visible = false;
    this.ability = false;
    sfx.door();
  }

  private exitCar() {
    const d = this.driving!;
    const lx = Math.cos(d.h),
      lz = -Math.sin(d.h);
    const p = { x: d.x + lx * (d.m.width / 2 + 0.7), z: d.z + lz * (d.m.width / 2 + 0.7) };
    if (this.pushCircle({ ...p }, R, 0, STEP_UP)) {
      p.x = d.x - lx * (d.m.width / 2 + 0.7);
      p.z = d.z - lz * (d.m.width / 2 + 0.7);
    }
    this.pos.set(p.x, this.groundAt(p.x, p.z, 1), p.z);
    this.vel.set(0, 0, 0);
    this.facing = d.h;
    this.parked.push({ m: d.m, x: d.x, z: d.z, h: d.h });
    d.m.setLights(this.skyState.night, false);
    this.driving = null;
    this.player.root.visible = true;
    sfx.door();
  }

  private nearestCardBox(): BoxState | null {
    let best: BoxState | null = null,
      bd = Infinity;
    for (const b of this.boxes) {
      if (b.open || b.content.kind !== "card") continue;
      const q = b.model.root.position;
      const d = Math.hypot(this.pos.x - q.x, this.pos.z - q.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  openBox(i: number) {
    const b = this.boxes[i];
    if (b.open) return;
    b.open = true;
    this.events.onBox(i, b.content);
    if (b.content.kind === "card") {
      const def = CARDS.find((c) => c.id === (b.content as { card: string }).card)!;
      b.pop = buildCard(def, 0.9);
      sfx.cardFound();
    } else if (b.content.kind === "coins") {
      const g = new THREE.Group();
      for (let k = 0; k < b.content.n; k++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.25, emissive: 0x6a4a00 }));
        coin.rotation.x = Math.PI / 2;
        coin.position.set((k - (b.content.n - 1) / 2) * 0.32, 0, 0);
        g.add(coin);
      }
      b.pop = g;
      sfx.coin();
    } else {
      const g = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc9b89a, transparent: true, opacity: 0.8 }));
        puff.position.set(Math.cos(k) * 0.3, 0, Math.sin(k) * 0.3);
        g.add(puff);
      }
      b.pop = g;
      sfx.empty();
    }
    b.pop.position.copy(b.model.root.position).add(new THREE.Vector3(0, 0.8, 0));
    b.popT = 0;
    this.scene.add(b.pop);
  }

  private updateEnvironment(dt: number) {
    // clock and weather
    // always daytime: the sun drifts gently between morning and afternoon
    this.hour = 12.3 + 3.6 * Math.sin((this.time - this.dayT0) / (HOUR_SECONDS * 4));
    const wantRain = false; // clear weather only
    if (wantRain !== this.rainOn) {
      this.rainOn = wantRain;
      this.events.onToast(wantRain ? "It's starting to rain..." : "The rain has stopped.");
    }
    this.wet = Math.max(0, Math.min(1, this.wet + (this.rainOn ? dt / 20 : -dt / 90)));
    const s = skyAt(this.hour);
    if (this.rainOn) {
      // overcast: greyer sky and less sun
      const grey = new THREE.Color(0.32, 0.34, 0.38).multiplyScalar(1 - s.night * 0.8);
      s.top.lerp(grey, 0.7);
      s.hor.lerp(grey, 0.6);
      s.fog.lerp(grey, 0.6);
      s.sunI *= 0.35;
    }
    this.skyState = s;
    this.sky.update(s, this.time, this.rainOn ? 1 : 0.2);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(s.fog);
    fog.density = this.inside ? 0 : 0.0042 + s.night * 0.0025 + this.wet * 0.006;
    if (this.inside) {
      this.hemi.color.set(0xfff0e0);
      this.hemi.groundColor.set(0x40303a);
      this.hemi.intensity = 1.15;
      this.sun.intensity = 0;
    } else {
      this.hemi.color.copy(s.ambSky);
      this.hemi.groundColor.copy(s.ambGround);
      this.hemi.intensity = s.amb;
      this.sun.color.copy(s.sun);
      this.sun.intensity = s.sunI;
    }
    this.bloom.strength = 0.15 + s.night * 0.35 + this.wet * 0.08;
    this.city.setEnv(s.night, this.wet);
    this.renderer.toneMappingExposure = 0.95 + s.night * 0.15;
    // refresh the reflection map now and then
    this.envT += dt;
    if (this.envT > 12) {
      this.envT = 0;
      const old = this.envTex;
      this.envTex = skyEnvironment(this.renderer, s, this.quality);
      this.scene.environment = this.envTex;
      old?.dispose();
    }
  }

  private step(dt: number) {
    const { jump, action, car, camDX, camDY, horn } = consume();
    if (camDY) this.pitch = Math.max(-0.05, Math.min(1.1, this.pitch + camDY * 0.004));
    if (horn && this.driving) {
      sfx.horn();
      for (const c of this.traffic) c.v = Math.max(c.v, 0);
    }
    engine(this.driving && !this.paused ? this.driving.v : null);
    const def = charById(this.char);
    const night = this.skyState.night;

    if (camDX) {
      this.camYaw -= camDX * 0.006;
      this.yaw -= camDX * 0.006;
    }

    if (this.driving) this.drive(dt, jump, car);
    else this.walk(dt, jump, action, car, def);

    // ---------- traffic ----------
    const threats: { x: number; z: number; r: number }[] = [];
    const playerX = this.driving ? this.driving.x : this.pos.x,
      playerZ = this.driving ? this.driving.z : this.pos.z;
    if (!this.inside) {
      for (const c of this.traffic) {
        let target = c.cruise;
        const front = c.pos + (c.dir * c.m.length) / 2;
        // red lights
        const sig = signalFor(c.axis, this.time);
        if (sig !== "green")
          for (const rc of ROAD_CENTERS) {
            const stop = rc - c.dir * 7.9;
            const gap = (stop - front) * c.dir;
            if (gap > -0.5 && gap < 16 && !(sig === "yellow" && gap < 4)) target = Math.min(target, Math.max(0, gap - 0.5) * 0.9);
          }
        // car ahead in the same lane
        for (const o of this.traffic) {
          if (o === c || o.axis !== c.axis || o.lane !== c.lane) continue;
          const gap = (o.pos - c.pos) * c.dir - (c.m.length + o.m.length) / 2;
          if (gap > -1 && gap < 12) target = Math.min(target, Math.max(0, gap - 2) * 0.9);
        }
        // the player (on foot or driving) or a parked obstacle in front
        const lx = c.axis === "x" ? playerZ - c.lane : playerX - c.lane;
        const along = ((c.axis === "x" ? playerX : playerZ) - c.pos) * c.dir;
        if (!this.inside && Math.abs(lx) < (this.driving ? 2.2 : 1.4) && along > 0 && along < 14) target = Math.min(target, Math.max(0, along - c.m.length / 2 - 2) * 0.8);
        const blocked = Math.abs(lx) < (this.driving ? 2.2 : 1.4) && along > 0 && along < 9 && c.v < 0.6;
        if (blocked && this.time - this.lastHonk > 2.2) {
          this.lastHonk = this.time;
          sfx.honk(1);
        }
        c.brake = target < c.v - 0.5;
        c.v += Math.max(-10 * dt, Math.min(4 * dt, target - c.v));
        c.v = Math.max(0, c.v);
        c.pos += c.dir * c.v * dt;
        if (c.pos > 96) c.pos = -96;
        if (c.pos < -96) c.pos = 96;
        const [x, z, h] = this.carPose(c);
        c.m.root.position.set(x, 0, z);
        c.m.root.rotation.y = h;
        for (const w of c.m.wheels) w.rotation.x += (c.v * dt) / 0.34;
        c.m.setLights(night, c.brake || c.v < 0.3);
        if (c.v > 2) threats.push({ x: x + (c.axis === "x" ? c.dir * 3 : 0), z: z + (c.axis === "z" ? c.dir * 3 : 0), r: 2.6 });
        // knock a walking player who got in the way anyway
        if (!this.driving) {
          const llx = c.axis === "x" ? this.pos.z - c.lane : this.pos.x - c.lane;
          const llz = (c.axis === "x" ? this.pos.x : this.pos.z) - c.pos;
          if (Math.abs(llx) < c.m.width / 2 + 0.3 && Math.abs(llz) < c.m.length / 2 + 0.2 && this.pos.y < 1.7 && this.stunT <= 0 && c.v > 1.5) {
            const side = Math.sign(llx) || 1;
            if (c.axis === "x") this.vel.set(c.dir * 7, 6, side * 6);
            else this.vel.set(side * 6, 6, c.dir * 7);
            this.onGround = false;
            this.stunT = 0.7;
            sfx.crash(0.35);
            this.events.onToast("Watch the traffic!");
          }
        }
      }
      const cx = this.camera.position.x,
        cz = this.camera.position.z;
      for (const p of this.parked) p.m.root.visible = Math.abs(p.x - cx) < 70 && Math.abs(p.z - cz) < 70;
      for (const c of this.traffic) c.m.root.visible = Math.abs(c.m.root.position.x - cx) < 80 && Math.abs(c.m.root.position.z - cz) < 80;
      if (this.driving) threats.push({ x: this.driving.x, z: this.driving.z, r: 3 + Math.abs(this.driving.v) * 0.25 });
      else threats.push({ x: this.pos.x, z: this.pos.z, r: 0.9 });
      const scared = this.peds.update(dt, threats, this.driving ? new THREE.Vector3(this.driving.x, 0, this.driving.z) : this.pos);
      if (scared && this.driving && Math.abs(this.driving.v) > 4 && this.time - this.lastYell > 1.2) {
        this.lastYell = this.time;
        sfx.yell();
      }
    }

    // ---------- street coins ----------
    if (!this.inside) {
      const m4 = new THREE.Matrix4(),
        q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * 3),
        one = new THREE.Vector3(1, 1, 1),
        zero = new THREE.Vector3(0, 0, 0);
      const reach = this.driving ? 2.2 : 1.1;
      let got = 0;
      this.coinPos.forEach((p, i) => {
        if (!this.coinGone[i] && Math.abs(p.x - playerX) < reach && Math.abs(p.z - playerZ) < reach && Math.abs(p.y - 0.9 - this.pos.y) < 1.6) {
          this.coinGone[i] = true;
          got++;
        }
        m4.compose(p, q, this.coinGone[i] ? zero : one);
        this.coins.setMatrixAt(i, m4);
      });
      this.coins.instanceMatrix.needsUpdate = true;
      if (got) {
        sfx.coin();
        this.events.onPickup(got);
      }
    }

    // ---------- boxes ----------
    for (const b of this.boxes) {
      if (b.open && b.t < 1) {
        b.t = Math.min(1, b.t + dt * 4);
        b.model.open(b.t);
      }
      b.model.glow.visible = !this.inside && this.ability && this.char === "noir" && !b.open && b.content.kind === "card";
      if (b.pop) {
        b.popT += dt;
        b.pop.position.y += dt * (b.popT < 0.6 ? 2.2 : 0.3);
        b.pop.rotation.y += dt * 5;
        if (b.popT > 1.6) {
          b.pop.scale.multiplyScalar(1 - Math.min(1, dt * 8));
          if (b.popT > 2.2) {
            this.scene.remove(b.pop);
            b.pop = null;
          }
        }
      }
    }

    // friends in the plaza turn to look at you
    for (const n of this.npcs) {
      const d = Math.hypot(playerX - n.x, playerZ - n.z);
      const want = d < 6 ? Math.atan2(playerX - n.x, playerZ - n.z) : n.face;
      let dr = want - n.model.root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      n.model.root.rotation.y += dr * Math.min(1, dt * 4);
      n.model.animate(dt, 0, false, false);
    }

    // radar arrow (naxweb3)
    const target = this.char === "naxweb3" && this.ability && !this.inside && !this.driving ? this.nearestCardBox() : null;
    this.radarArrow.visible = !!target;
    if (target) {
      const q = target.model.root.position;
      this.radarArrow.position.set(this.pos.x, this.pos.y + 2.7 + Math.sin(performance.now() / 200) * 0.08, this.pos.z);
      this.radarArrow.lookAt(q.x, this.pos.y + 2.7, q.z);
    }

    this.updateCamera(dt);

    // HUD a few times a second
    this.hudT -= dt;
    const near = this.driving ? null : this.near();
    const carNear = !this.driving && !near && !!this.nearCar();
    const label = this.driving
      ? null
      : near
        ? near.kind === "box"
          ? "OPEN BOX"
          : near.kind === "door"
            ? "ENTER GAME HOUSE"
            : near.kind === "npc"
              ? `TALK TO ${charById(near.id).name}`
              : near.label
        : carNear
          ? "GET IN CAR"
          : null;
    if (this.hudT <= 0 || label !== this.lastPrompt) {
      this.hudT = 0.2;
      this.lastPrompt = label;
      let radar: WorldHud["radar"] = null;
      if (target) {
        const q = target.model.root.position;
        radar = { dist: Math.hypot(q.x - this.pos.x, q.z - this.pos.z), angle: Math.atan2(q.x - this.pos.x, q.z - this.pos.z) - (this.yaw + Math.PI) };
      }
      const hh = Math.floor(this.hour),
        mm = Math.floor((this.hour % 1) * 60);
      this.events.onHud({
        prompt: label,
        inside: this.inside,
        ability: this.ability,
        radar,
        clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        speed: this.driving ? Math.round(Math.abs(this.driving.v) * 3.6) : null,
        rain: this.rainOn,
        carPrompt: carNear,
      });
    }
  }

  private walk(dt: number, jump: boolean, action: boolean, car: boolean, def: ReturnType<typeof charById>) {
    // gentle auto-follow of the camera while running forward
    const moving = Math.hypot(input.mx, input.mz) > 0.1;
    if (moving && performance.now() - input.lastDrag > 1500) {
      let diff = this.facing + Math.PI - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 0.9) * Math.max(0, input.mz);
    }
    const near = this.near();
    if (action) {
      if (near?.kind === "box") this.openBox(near.i);
      else if (near?.kind === "door") this.enterHouse();
      else if (near?.kind === "spot") {
        if (near.id === "door") this.exitHouse();
        else this.events.onInteract(near.id);
      } else if (near?.kind === "npc") this.events.onTalk(near.id);
      else {
        const c = this.nearCar();
        if (c) return this.enterCar(c);
        this.useAbility();
      }
    }
    if (car) {
      const c = this.nearCar();
      if (c) return this.enterCar(c);
    }

    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    let wx = rx * input.mx + fx * input.mz,
      wz = rz * input.mx + fz * input.mz;
    const len = Math.hypot(wx, wz);
    if (len > 1) {
      wx /= len;
      wz /= len;
    }
    const speed = this.inside ? 4 : def.speed * (this.fast ? 1.15 : 1);
    if (this.stunT > 0) {
      this.stunT -= dt;
      wx = wz = 0;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = Math.sin(this.facing) * 20;
      this.vel.z = Math.cos(this.facing) * 20;
    } else {
      const k = Math.min(1, dt * (this.onGround ? 12 : 4));
      if (this.stunT <= 0) {
        this.vel.x += (wx * speed - this.vel.x) * k;
        this.vel.z += (wz * speed - this.vel.z) * k;
      } else {
        this.vel.x *= 1 - Math.min(1, dt * 2);
        this.vel.z *= 1 - Math.min(1, dt * 2);
      }
    }
    this.dashCd -= dt;
    if (len > 0.1 && this.stunT <= 0 && this.dashT <= 0) {
      const target = Math.atan2(wx, wz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 14);
    }

    if (jump && this.stunT <= 0) {
      if (this.onGround) {
        this.vel.y = def.jump;
        this.onGround = false;
        this.jumpsLeft = def.ability.id === "doubleJump" ? 1 : 0;
        sfx.jump();
      } else if (this.jumpsLeft > 0) {
        this.vel.y = def.jump * 0.95;
        this.jumpsLeft--;
        sfx.jump2();
      }
    }
    if (!input.jumpHeld && this.vel.y > 3) this.vel.y -= GRAV * dt * 1.2;
    this.vel.y -= GRAV * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pushCircle(this.pos, R, this.pos.y, STEP_UP);
    // parked cars and townspeople are solid too
    if (!this.inside) {
      for (const p of this.parked) this.pushFromCar(this.pos, R, p.x, p.z, p.h, p.m);
      const ped = this.peds.near(this.pos.x, this.pos.z, 0.6);
      if (ped) {
        const dx = this.pos.x - ped.x,
          dz = this.pos.z - ped.z,
          l = Math.hypot(dx, dz) || 1;
        this.pos.x = ped.x + (dx / l) * 0.6;
        this.pos.z = ped.z + (dz / l) * 0.6;
      }
    }
    this.pos.y += this.vel.y * dt;
    const ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -12) sfx.land();
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
      if (!this.inside) this.lastSafe.copy(this.pos);
    } else if (this.pos.y > ground + 0.05) this.onGround = false;
    if (this.pos.y < -10) this.pos.copy(this.lastSafe);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.stepAcc += hs * dt;
    if (this.stepAcc > 1.5) {
      this.stepAcc = 0;
      sfx.step();
    }
    this.player.root.position.copy(this.pos);
    this.player.root.rotation.y = this.facing;
    this.player.animate(dt, Math.min(1, hs / 7), !this.onGround, this.ability);
  }

  /** Keep a circle out of a car's rectangle (in the car's local frame). */
  private pushFromCar(p: { x: number; z: number }, rad: number, cx: number, cz: number, h: number, m: CarModel): boolean {
    const s = Math.sin(h),
      c = Math.cos(h);
    const dx = p.x - cx,
      dz = p.z - cz;
    const lx = dx * c - dz * s,
      lz = dx * s + dz * c;
    const hw = m.width / 2,
      hl = m.length / 2;
    const qx = Math.max(-hw, Math.min(lx, hw)),
      qz = Math.max(-hl, Math.min(lz, hl));
    let ex = lx - qx,
      ez = lz - qz;
    let d = Math.hypot(ex, ez);
    if (d >= rad) return false;
    if (d < 1e-5) {
      // inside: leave sideways
      ex = lx >= 0 ? 1 : -1;
      ez = 0;
      d = 0;
      const nx = (lx >= 0 ? hw : -hw) + ex * rad;
      const wx = nx * c + lz * s,
        wz = -nx * s + lz * c;
      p.x = cx + wx;
      p.z = cz + wz;
      return true;
    }
    const k = rad / d;
    const nlx = qx + ex * k,
      nlz = qz + ez * k;
    p.x = cx + nlx * c + nlz * s;
    p.z = cz - nlx * s + nlz * c;
    return true;
  }

  private drive(dt: number, handbrake: boolean, car: boolean) {
    const d = this.driving!;
    if (car && Math.abs(d.v) < 5) return this.exitCar();
    if (car) this.events.onToast("Slow down to get out");
    const thr = input.mz,
      st = input.mx;
    // engine, brakes, drag
    if (thr > 0) d.v += (d.v < 0 ? 18 : 9.5 * (1 - d.v / 30)) * dt;
    else if (thr < 0) d.v -= (d.v > 0 ? 16 : 5) * dt;
    else d.v -= Math.sign(d.v) * Math.min(Math.abs(d.v), (1.5 + Math.abs(d.v) * 0.08) * dt);
    if (handbrake) d.v -= Math.sign(d.v) * Math.min(Math.abs(d.v), 12 * dt);
    if (((handbrake && Math.abs(d.v) > 6) || (thr < 0 && d.v > 9) || (Math.abs(st) > 0.5 && Math.abs(d.v) > 19)) && this.time - this.lastSkid > 0.28) {
      this.lastSkid = this.time;
      sfx.skid();
    }
    d.v = Math.max(-8, Math.min(28, d.v));
    // steering gets lighter at speed
    const maxSteer = 0.55 / (1 + Math.abs(d.v) * 0.05);
    d.steer += (-st * maxSteer - d.steer) * Math.min(1, dt * 6);
    const turn = (d.v / 2.8) * Math.tan(d.steer) * (handbrake ? 1.5 : 1);
    d.h += turn * dt;
    const ox = d.x,
      oz = d.z;
    d.x += Math.sin(d.h) * d.v * dt;
    d.z += Math.cos(d.h) * d.v * dt;
    this.driveAcc += Math.abs(d.v) * dt;
    if (this.driveAcc > 25) {
      this.events.onDrive(this.driveAcc);
      this.driveAcc = 0;
    }
    // collisions: two circles along the body
    const off = d.m.length / 2 - d.m.width / 2;
    const rad = d.m.width / 2 + 0.05;
    let hit = false;
    for (const sgn of [1, -1]) {
      const p = { x: d.x + Math.sin(d.h) * off * sgn, z: d.z + Math.cos(d.h) * off * sgn };
      const q = { ...p };
      let h2 = this.pushCircle(q, rad, d.y, 0.6);
      for (const pk of this.parked) h2 = this.pushFromCar(q, rad, pk.x, pk.z, pk.h, pk.m) || h2;
      for (const t of this.traffic) {
        const [tx, tz, th] = this.carPose(t);
        if (this.pushFromCar(q, rad, tx, tz, th, t.m)) {
          h2 = true;
          t.v = 0;
          if (this.time - this.lastHonk > 1.5) {
            this.lastHonk = this.time;
            sfx.honk(1);
          }
        }
      }
      if (h2) {
        hit = true;
        d.x += q.x - p.x;
        d.z += q.z - p.z;
      }
    }
    if (hit) {
      if (Math.abs(d.v) > 2.5 && this.time - this.lastCrash > 0.25) {
        this.lastCrash = this.time;
        sfx.crash(Math.abs(d.v) / 18);
        if (Math.abs(d.v) > 14) this.events.onToast("Crash!");
      }
      d.v *= -0.25;
      if (Math.hypot(d.x - ox, d.z - oz) > 2) (d.x = ox), (d.z = oz);
    }
    d.x = Math.max(-90, Math.min(90, d.x));
    d.z = Math.max(-90, Math.min(90, d.z));
    const gy = this.onSidewalk(d.x, d.z) ? SW : 0;
    d.y += (gy - d.y) * Math.min(1, dt * 12);
    d.m.root.position.set(d.x, d.y, d.z);
    d.m.root.rotation.y = d.h;
    d.m.root.rotation.z = -d.steer * Math.min(1, Math.abs(d.v) / 20) * 0.08; // body roll
    for (const w of d.m.wheels) w.rotation.x += (d.v * dt) / 0.34;
    for (const p of d.m.steer) p.rotation.y = d.steer;
    d.m.setLights(this.skyState.night, thr < 0 && d.v > 0.5);
    // the player rides along (for the minimap and the NPCs)
    this.pos.set(d.x, d.y, d.z);
    this.facing = d.h;
  }

  private updateCamera(dt: number) {
    {
      let dist = this.inside ? 4.2 : 6.4,
        h = 2.6,
        tgtH = 1.45;
      if (this.driving) {
        const d = this.driving;
        dist = 8.2 + Math.abs(d.v) * 0.08;
        h = 3.1;
        tgtH = 1.3;
        // swing behind the car unless the player is looking around
        if (performance.now() - input.lastDrag > 1200) {
          let diff = d.h + Math.PI - this.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          this.yaw += diff * Math.min(1, dt * (Math.abs(d.v) > 1 ? 3 : 0.5));
        }
      }
      const tgt = new THREE.Vector3(this.pos.x, this.pos.y + tgtH, this.pos.z);
      void h;
      const cp = Math.cos(this.pitch) * dist;
      const want = new THREE.Vector3(tgt.x + Math.sin(this.yaw) * cp, tgt.y + Math.sin(this.pitch) * dist + (this.driving ? 0.6 : 0.2), tgt.z + Math.cos(this.yaw) * cp);
      const dir = want.clone().sub(tgt);
      const full = dir.length();
      dir.normalize();
      let tmax = full;
      for (const c of this.colliders()) {
        if (!c.tall) continue;
        const t = rayBox(tgt, dir, c);
        if (t !== null && t < tmax) tmax = Math.max(1.2, t - 0.3);
      }
      want.copy(tgt).addScaledVector(dir, tmax);
      if (this.inside) {
        const B = this.interior.bounds,
          O = INTERIOR_ORIGIN;
        want.x = Math.max(O.x - B.hx, Math.min(O.x + B.hx, want.x));
        want.z = Math.max(O.z - B.hz, Math.min(O.z + B.hz, want.z));
        want.y = Math.min(B.h, want.y);
      }
      this.camera.position.lerp(want, Math.min(1, dt * 10));
      this.camera.lookAt(tgt);
    }
    if (this.sun.castShadow || true) {
      const sd = this.skyState.sunDir;
      this.sun.position.set(this.pos.x + sd.x * 70, sd.y * 70, this.pos.z + sd.z * 70);
      this.sun.target.position.copy(this.pos);
    }
    this.sky.group.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  useAbility() {
    const id = charById(this.char).ability.id;
    if (this.inside || this.driving) return;
    if (id === "dash") {
      if (this.dashCd > 0) return;
      this.dashT = 0.24;
      this.dashCd = 0.9;
      sfx.dash();
    } else if (id === "nightVision" || id === "radar") {
      this.ability = !this.ability;
      sfx.toggle(this.ability);
    } else {
      this.events.onToast("Rhea's power: press jump again in the air!");
    }
  }

  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) {
      this.time += dt;
      this.updateEnvironment(dt);
      this.step(dt);
    } else consume();
    this.city.tick(this.time);
    this.sky.group.visible = !this.inside;
    this.city.group.visible = !this.inside;
    this.interior.tick(this.time);
    ambience(!this.inside && !this.paused);
    this.peds.group.visible = !this.inside;
    this.coins.visible = !this.inside;
    const cx = this.camera.position.x,
      cz = this.camera.position.z;
    for (const b of this.boxes) {
      const q = b.model.root.position;
      b.model.root.visible = !this.inside && Math.abs(q.x - cx) < 60 && Math.abs(q.z - cz) < 60;
    }
    this.rain.mesh.visible = this.rainOn && !this.inside;
    if (this.rain.mesh.visible) this.rain.update(dt, this.camera.position);
    this.composer.render();
  };

  /** Snapshot for the minimap. */
  mapState() {
    return {
      x: this.pos.x,
      z: this.pos.z,
      yaw: this.yaw,
      facing: this.facing,
      inside: this.inside,
      driving: !!this.driving,
      cardBoxes: this.scanner ? this.boxes.filter((b) => !b.open && b.content.kind === "card").map((b) => [b.model.root.position.x, b.model.root.position.z] as [number, number]) : [],
      opened: this.boxes.filter((b) => b.open).map((b) => [b.model.root.position.x, b.model.root.position.z] as [number, number]),
      cars: this.traffic.map((c) => this.carPose(c).slice(0, 2) as [number, number]),
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    engine(null);
    ambience(false);
    window.removeEventListener("resize", this.resize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, c: Collider): number | null {
  let tmin = 0,
    tmax = Infinity;
  const ax: [number, number, number, number][] = [
    [o.x, d.x, c.minX, c.maxX],
    [o.y, d.y, 0, c.top],
    [o.z, d.z, c.minZ, c.maxZ],
  ];
  for (const [p, v, lo, hi] of ax) {
    if (Math.abs(v) < 1e-8) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let t1 = (lo - p) / v,
      t2 = (hi - p) / v;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
