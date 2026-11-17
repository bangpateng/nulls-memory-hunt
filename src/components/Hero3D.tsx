import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCharacter } from "../game/characters";
import { buildCar } from "../game/vehicles";
import { Sky, skyAt, skyEnvironment, buildComposer } from "../game/fx";
import { asphalt, facade, rep, shopfront, sidewalk } from "../game/textures";
import type { CharId } from "../game/data";

/** Landing page hero: the four Nulls hanging out on a street corner at golden hour. */
export default function Hero3D({ lite }: { lite: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: !lite, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = !lite;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const st = skyAt(16.2);
    scene.fog = new THREE.FogExp2(st.fog, 0.012);
    const sky = new Sky();
    sky.update(st, 0, 0.3);
    scene.add(sky.group);
    scene.environment = skyEnvironment(r, st);
    scene.add(new THREE.HemisphereLight(st.ambSky, st.ambGround, st.amb));
    const sun = new THREE.DirectionalLight(st.sun, st.sunI);
    sun.position.copy(st.sunDir).multiplyScalar(40);
    sun.castShadow = !lite;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), std({ map: rep(asphalt(), 25, 25) }));
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);
    const walk = new THREE.Mesh(new THREE.BoxGeometry(60, 0.15, 14), std({ map: rep(sidewalk(), 12, 3) }));
    walk.position.set(0, 0.075, -6);
    walk.receiveShadow = true;
    scene.add(walk);
    for (const x of [-3, 3]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 200), std({ color: 0xd8b23a }));
      line.rotation.x = -Math.PI / 2;
      line.rotation.z = Math.PI / 2;
      line.position.set(0, 0.01, 6 + x * 0.04);
      scene.add(line);
    }
    // row of buildings behind
    const styles = ["brick", "stucco", "concrete", "darkbrick", "glass", "brick"] as const;
    styles.forEach((s, k) => {
      const f = facade(s, k % 2);
      const h = 14 + ((k * 7) % 4) * 3.5;
      const mat = std({ map: rep(f.map, 1, h / 14), roughness: s === "glass" ? 0.2 : 0.9, metalness: s === "glass" ? 0.5 : 0 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), mat);
      b.position.set(-25 + k * 10, h / 2 + 4, -18);
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
      const sh = shopfront(k);
      const shop = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10.05), std({ map: sh.map, emissiveMap: sh.lit, emissive: 0xffffff, emissiveIntensity: 0.4 }));
      shop.position.set(-25 + k * 10, 2.1, -18);
      scene.add(shop);
    });
    // a lamp post and a car parked at the kerb
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6.4, 8), std({ color: 0x2c2f33, metalness: 0.7, roughness: 0.4 }));
    pole.position.set(5.5, 3.3, -0.5);
    pole.castShadow = true;
    scene.add(pole);
    const car = buildCar(2, "taxi");
    car.root.position.set(-5.2, 0, 2.2);
    car.root.rotation.y = Math.PI / 2 - 0.05;
    scene.add(car.root);
    const car2 = buildCar(9, "sedan");
    car2.root.position.set(9, 0, 2.2);
    car2.root.rotation.y = Math.PI / 2;
    scene.add(car2.root);

    const ids: CharId[] = ["rhea", "noir", "meteora", "naxweb3"];
    const chars = ids.map((id, k) => {
      const m = buildCharacter(id);
      m.root.position.set(-2.4 + k * 1.6, 0.15, -1.2 + Math.abs(k - 1.5) * -0.4);
      m.root.rotation.y = (k - 1.5) * -0.18;
      m.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
      scene.add(m.root);
      return m;
    });

    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    const { composer, bloom } = buildComposer(r, scene, cam, !lite);
    bloom.strength = 0.3;
    let raf = 0,
      last = performance.now(),
      t = 0,
      mx = 0,
      my = 0;
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);
    const resize = () => {
      const w = cv.clientWidth,
        h = cv.clientHeight;
      r.setSize(w, h, false);
      composer.setSize(w, h);
      cam.aspect = w / h;
      cam.fov = w < h ? 48 : 32;
      cam.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const portrait = cv.clientWidth < cv.clientHeight;
      const a = Math.sin(t * 0.12) * 0.22 + mx * 0.25;
      const dist = portrait ? 14 : 12;
      cam.position.set(Math.sin(a) * dist + (portrait ? 0 : -4.6), 2.2 - my * 0.8, Math.cos(a) * dist);
      cam.lookAt(portrait ? 0 : -4.2, portrait ? -1.2 : 1.3, -1);
      chars.forEach((c) => c.animate(dt, 0, false, false));
      sky.update(st, t, 0.3);
      composer.render();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      composer.dispose();
      r.dispose();
    };
  }, [lite]);
  return <canvas ref={ref} className="heroCanvas" />;
}
