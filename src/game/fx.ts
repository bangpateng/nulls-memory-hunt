// Sky with a day/night cycle, rain, a sky-based reflection map and a light bloom post-process.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ---------- day / night ----------
type Key = { h: number; top: number; hor: number; sun: number; sunI: number; amb: number; ambSky: number; ambGround: number; fog: number; night: number };
const KEYS: Key[] = [
  { h: 0, top: 0x05070f, hor: 0x141a2e, sun: 0x8090c0, sunI: 0.25, amb: 0.35, ambSky: 0x3a4670, ambGround: 0x1a1a22, fog: 0x10142a, night: 1 },
  { h: 5, top: 0x070a18, hor: 0x1c2240, sun: 0x8090c0, sunI: 0.25, amb: 0.35, ambSky: 0x3a4670, ambGround: 0x1a1a22, fog: 0x161b34, night: 1 },
  { h: 6.3, top: 0x2b3a6a, hor: 0xd8906a, sun: 0xffb27a, sunI: 1.2, amb: 0.65, ambSky: 0x8fa0d0, ambGround: 0x4a3a30, fog: 0xa88878, night: 0.35 },
  { h: 8, top: 0x3d78c8, hor: 0x9fbcd8, sun: 0xfff0d8, sunI: 2.6, amb: 0.95, ambSky: 0xbcd4f0, ambGround: 0x5a5040, fog: 0x9fb2c4, night: 0 },
  { h: 16, top: 0x3a72c4, hor: 0xa2bed8, sun: 0xfff2dc, sunI: 2.7, amb: 0.95, ambSky: 0xbcd4f0, ambGround: 0x5a5040, fog: 0xa2b4c6, night: 0 },
  { h: 18, top: 0x3a4f8e, hor: 0xe8946a, sun: 0xffa868, sunI: 1.7, amb: 0.7, ambSky: 0xa0a4d0, ambGround: 0x5a4030, fog: 0xb88878, night: 0.1 },
  { h: 19.3, top: 0x1c1f48, hor: 0xa05a6a, sun: 0xff7050, sunI: 0.6, amb: 0.45, ambSky: 0x6a5a9a, ambGround: 0x2a2028, fog: 0x4a3448, night: 0.65 },
  { h: 20.5, top: 0x080b1c, hor: 0x2a2448, sun: 0x8090c0, sunI: 0.3, amb: 0.38, ambSky: 0x3a4670, ambGround: 0x1a1a22, fog: 0x1a1a34, night: 1 },
  { h: 24, top: 0x05070f, hor: 0x141a2e, sun: 0x8090c0, sunI: 0.25, amb: 0.35, ambSky: 0x3a4670, ambGround: 0x1a1a22, fog: 0x10142a, night: 1 },
];
const cA = new THREE.Color(),
  cB = new THREE.Color();
const lerpC = (a: number, b: number, t: number, out: THREE.Color) => out.copy(cA.set(a)).lerp(cB.set(b), t);

export interface SkyState {
  top: THREE.Color;
  hor: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  amb: number;
  ambSky: THREE.Color;
  ambGround: THREE.Color;
  fog: THREE.Color;
  night: number;
  sunDir: THREE.Vector3; // towards the sun (or the moon at night)
}

export function skyAt(hour: number): SkyState {
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1].h <= hour) k++;
  const a = KEYS[k],
    b = KEYS[k + 1];
  const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
  // the sun rises in the east (+x) at 6 and sets in the west at 19; at night the moon takes over
  const day = hour >= 6 && hour <= 19.3;
  const ang = day ? ((hour - 6) / 13.3) * Math.PI : (((hour + 24 - 19.3) % 24) / 10.7) * Math.PI;
  const sunDir = new THREE.Vector3(Math.cos(ang), Math.max(0.12, Math.sin(ang)) * (day ? 1 : 0.9), -0.45).normalize();
  return {
    top: lerpC(a.top, b.top, t, new THREE.Color()),
    hor: lerpC(a.hor, b.hor, t, new THREE.Color()),
    sun: lerpC(a.sun, b.sun, t, new THREE.Color()),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    amb: a.amb + (b.amb - a.amb) * t,
    ambSky: lerpC(a.ambSky, b.ambSky, t, new THREE.Color()),
    ambGround: lerpC(a.ambGround, b.ambGround, t, new THREE.Color()),
    fog: lerpC(a.fog, b.fog, t, new THREE.Color()),
    night: a.night + (b.night - a.night) * t,
    sunDir,
  };
}

export class Sky {
  group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private stars: THREE.PointsMaterial;
  private sunDisc: THREE.Mesh;
  private moon: THREE.Mesh;
  private clouds: THREE.Mesh;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.6, h), 0.7));
          float s = max(dot(normalize(vP), normalize(sunDir)), 0.0);
          c += sunCol * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6) * (1.0 - night);
          c = mix(c, hor * 0.6, smoothstep(0.0, -0.1, vP.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.mat);
    dome.renderOrder = -10;
    this.group.add(dome);
    const n = 900,
      pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        y = 0.15 + Math.random() * 0.85,
        r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 280, y * 280, Math.sin(a) * r * 280], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
    this.group.add(new THREE.Points(sg, this.stars));
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false, toneMapped: false }));
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    this.group.add(this.sunDisc, this.moon);
    // a soft cloud layer
    const cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    const c = cv.getContext("2d")!;
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 512,
        y = Math.random() * 512,
        r = 20 + Math.random() * 60;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const ct = new THREE.CanvasTexture(cv);
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.repeat.set(2, 2);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.6 }));
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 120;
    this.group.add(this.clouds);
  }
  update(s: SkyState, t: number, cloudy: number) {
    this.mat.uniforms.top.value.copy(s.top);
    this.mat.uniforms.hor.value.copy(s.hor);
    this.mat.uniforms.sunDir.value.copy(s.sunDir);
    this.mat.uniforms.sunCol.value.copy(s.sun);
    this.mat.uniforms.night.value = s.night;
    this.stars.opacity = Math.max(0, s.night - 0.3) * (1 - cloudy * 0.8);
    const d = s.sunDir.clone().multiplyScalar(260);
    this.sunDisc.position.copy(d);
    this.sunDisc.lookAt(0, 0, 0);
    this.sunDisc.visible = s.night < 0.6;
    this.moon.position.copy(d);
    this.moon.lookAt(0, 0, 0);
    this.moon.visible = s.night >= 0.6;
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.color.copy(s.hor).lerp(new THREE.Color(1, 1, 1), 0.5 * (1 - s.night)).multiplyScalar(0.6 + 0.4 * (1 - s.night));
    cm.opacity = 0.35 + cloudy * 0.55;
    (cm.map as THREE.Texture).offset.set(t * 0.002, t * 0.001);
  }
}

/** Streaks of rain that follow the camera. */
export class Rain {
  mesh: THREE.LineSegments;
  private pos: Float32Array;
  private n: number;
  constructor(n = 1600) {
    this.n = n;
    this.pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.reset(i, Math.random() * 30);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.mesh.frustumCulled = false;
  }
  private reset(i: number, y: number) {
    const x = (Math.random() - 0.5) * 50,
      z = (Math.random() - 0.5) * 50;
    this.pos.set([x, y, z, x + 0.06, y + 0.7, z], i * 6);
  }
  update(dt: number, center: THREE.Vector3) {
    this.mesh.position.set(center.x, 0, center.z);
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const k = i * 6;
      p[k + 1] -= 26 * dt;
      p[k + 4] -= 26 * dt;
      p[k] -= 1.2 * dt;
      p[k + 3] -= 1.2 * dt;
      if (p[k + 1] < 0) this.reset(i, 22 + Math.random() * 6);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Environment map from the current sky colours, so glass and paint reflect the right light. */
export function skyEnvironment(renderer: THREE.WebGLRenderer, st: SkyState, _q: string = "high"): THREE.Texture {
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: st.top }, hor: { value: st.hor }, ground: { value: st.ambGround } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 ground; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor, ground * 0.5, smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  sc.add(dome);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  dome.geometry.dispose();
  (dome.material as THREE.Material).dispose();
  return tex;
}

export function buildComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, high: boolean) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.45, 0.88);
  if (!high) bloom.resolution.set(size.x / 2, size.y / 2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}
