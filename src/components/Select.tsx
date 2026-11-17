import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildCharacter } from "../game/characters";
import { CHARACTERS, type CharId } from "../game/data";
import { sfx } from "../game/audio";

// Player select: one Null on a turntable, the colour backdrop of their poster, and their power.
export default function Select(p: { initial: CharId; onPick(c: CharId): void; onBack?(): void; title?: string }) {
  const [i, setI] = useState(Math.max(0, CHARACTERS.findIndex((c) => c.id === p.initial)));
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; models: THREE.Group[]; anim: ((dt: number) => void)[] } | null>(null);
  const def = CHARACTERS[i];

  useEffect(() => {
    const cv = canvas.current!;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.7));
    const d = new THREE.DirectionalLight(0xffffff, 2);
    d.position.set(2, 4, 5);
    scene.add(d);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.08, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    disc.position.y = -0.04;
    scene.add(disc);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.35, 4.9);
    cam.lookAt(0, 1.05, 0);
    const models: THREE.Group[] = [];
    const anim: ((dt: number) => void)[] = [];
    for (const c of CHARACTERS) {
      const m = buildCharacter(c.id);
      m.root.visible = false;
      scene.add(m.root);
      models.push(m.root);
      anim.push((dt) => m.animate(dt, 0, false, false));
    }
    stage.current = { r, scene, cam, models, anim };
    let raf = 0,
      last = performance.now(),
      t = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const w = cv.clientWidth,
        h = cv.clientHeight;
      if (cv.width !== Math.floor(w * r.getPixelRatio())) {
        r.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      models.forEach((m, k) => {
        if (m.visible) {
          m.rotation.y = Math.sin(t * 0.8) * 0.6;
          anim[k](dt);
        }
      });
      r.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
    };
  }, []);

  useEffect(() => {
    stage.current?.models.forEach((m, k) => (m.visible = k === i));
  }, [i]);

  const go = (d: number) => {
    sfx.blip();
    setI((x) => (x + d + CHARACTERS.length) % CHARACTERS.length);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") go(-1);
      if (e.code === "ArrowRight" || e.code === "KeyD") go(1);
      if (e.code === "Enter" || e.code === "Space") {
        sfx.select();
        p.onPick(CHARACTERS[i].id);
      }
      if (e.code === "Escape" && p.onBack) p.onBack();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <div className="select" style={{ background: def.bg }}>
      <div className="selTop">
        {p.onBack && (
          <button className="pill" onClick={p.onBack}>
            ◀ BACK
          </button>
        )}
        <h2>{p.title ?? "PLAYER SELECT"}</h2>
        <span />
      </div>
      <div className="selStage">
        <button className="arrow" aria-label="Previous player" onClick={() => go(-1)}>
          ◀
        </button>
        <canvas ref={canvas} className="selCanvas" />
        <button className="arrow" aria-label="Next player" onClick={() => go(1)}>
          ▶
        </button>
      </div>
      <div className="selInfo">
        <p className="selTag">« {def.tag} »</p>
        <h3>{def.name}</h3>
        <div className="power">
          <b>{def.ability.name}</b>
          <span>{def.ability.text}</span>
        </div>
        <div className="dots">
          {CHARACTERS.map((c, k) => (
            <button key={c.id} aria-label={c.name} className={k === i ? "on" : ""} onClick={() => setI(k)} />
          ))}
        </div>
        <button
          className="gbBtn primary big"
          onClick={() => {
            sfx.select();
            p.onPick(def.id);
          }}
        >
          ▶ PLAY AS {def.name}
        </button>
      </div>
    </div>
  );
}
