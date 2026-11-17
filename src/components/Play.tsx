import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { World, type WorldHud } from "../game/world";
import { buy, CARDS, cardById, charById, checkQuests, currentQuest, foundCount, newHunt, openBox, QUESTS, scannerOn, SHOP, type BoxContent, type CharId, type Save } from "../game/data";
import { input } from "../game/input";
import { audioState, music, nextTrack, onTrack, setAudio, sfx, trackName } from "../game/audio";
import { LIMIT } from "../game/city";
import Select from "./Select";
import Gameboy from "./Gameboy";
import { CardChip } from "./Common";

const TALK: Record<CharId, string[]> = {
  rhea: ["Hey! Some boxes sit up on the low rooftops.", "With me you can jump again in the air. Switch to me at the wardrobe in the Game House."],
  noir: ["Shh. My goggles see what you can't.", "Play as me and switch the goggles on: boxes with a memory card glow green."],
  meteora: ["Crossing town takes ages, right?", "My dash is the fastest way around. Just watch out for the cars."],
  naxweb3: ["Yo! My gold chain knows where the cards are.", "Play as me, switch the radar on and follow the arrow to the nearest card."],
};

type Toast = { id: number; kind: "card" | "coins" | "empty" | "info"; text: string; card?: string };

export default function Play(p: { save: Save; quality: "high" | "low"; onSave(s: Save): void; onQuit(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const saveRef = useRef(p.save);
  saveRef.current = p.save;
  const [hud, setHud] = useState<WorldHud>({ prompt: null, inside: false, ability: false, radar: null, clock: "17:12", speed: null, rain: false, carPrompt: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [talk, setTalk] = useState<{ who: CharId; line: number } | null>(null);
  const [modal, setModal] = useState<null | "gameboy" | "wardrobe" | "bed" | "pause" | "shop" | "map">(null);
  const [aud, setAud] = useState(audioState());
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const def = charById(p.save.char);

  const toast = (t: Omit<Toast, "id">) => {
    const id = Math.random();
    setToasts((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), t.kind === "card" ? 3600 : 2200);
  };

  /** Every change to the save goes through here, so finished quests are paid out right away. */
  const apply = (fn: (s: Save) => Save) => {
    const q = checkQuests(fn(saveRef.current));
    saveRef.current = q.save;
    p.onSave(q.save);
    for (const d of q.done) {
      sfx.win();
      toast({ kind: "card", text: `QUEST DONE: ${d.title}  +${d.reward} coins` });
    }
    return q.save;
  };
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    w.fast = p.save.owned.includes("sneakers");
    w.scanner = scannerOn(p.save);
  }, [p.save]);

  useEffect(() => {
    const w = new World(
      canvas.current!,
      p.save,
      {
        onHud: (h) => setHud(h),
        onBox: (i: number, c: BoxContent) => {
          const before = saveRef.current;
          const next = apply((s) => openBox(s, i, c));
          w.updateShelf(next);
          if (c.kind === "card") {
            const card = cardById(c.card);
            const dup = before.cards[c.card].found;
            toast({ kind: "card", card: c.card, text: dup ? `${card.title} again! +10 coins` : `MEMORY CARD! ${card.title}` });
          } else if (c.kind === "coins") toast({ kind: "coins", text: `+${c.n} COIN${c.n > 1 ? "S" : ""}` });
          else toast({ kind: "empty", text: ["Empty...", "Just old newspapers.", "Nothing here.", "Only dust."][i % 4] });
        },
        onInteract: (id) => {
          sfx.select();
          w.paused = true;
          setModal(id);
        },
        onTalk: (who) => {
          sfx.blip();
          w.paused = true;
          setTalk({ who, line: 0 });
        },
        onToast: (text) => toast({ kind: "info", text }),
        onPickup: (n) => apply((s) => ({ ...s, coins: s.coins + n, stats: { ...s.stats, pickups: s.stats.pickups + n } })),
        onDrive: (m) => apply((s) => ({ ...s, stats: { ...s.stats, driven: s.stats.driven + m } })),
      },
      p.quality,
    );
    w.updateShelf(p.save);
    w.fast = p.save.owned.includes("sneakers");
    w.scanner = scannerOn(p.save);
    world.current = w;
    if (location.search.includes("debug")) Object.assign(window, { nulls: w, THREE });
    if (!p.save.playedIntro) {
      apply((s) => ({ ...s, playedIntro: true }));
      setTimeout(() => toast({ kind: "info", text: "Boxes are hidden all over town. Open them to find memory cards!" }), 600);
    }
    return () => w.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (modal === "gameboy") return;
    music(hud.inside ? "house" : "city");
  }, [hud.inside, modal]);

  // minimap, north up, centred on the player
  useEffect(() => {
    const id = setInterval(() => {
      const w = world.current,
        cv = mapRef.current;
      if (!w || !cv) return;
      const g = cv.getContext("2d")!;
      const s = w.mapState();
      const size = cv.width;
      g.fillStyle = "#121018";
      g.fillRect(0, 0, size, size);
      if (s.inside) {
        g.fillStyle = "#ffb02e";
        g.font = "10px 'Press Start 2P'";
        g.textAlign = "center";
        g.fillText("GAME", size / 2, size / 2 - 6);
        g.fillText("HOUSE", size / 2, size / 2 + 10);
        return;
      }
      const ppm = 2.2; // pixels per metre
      const base = w.city.map;
      const k = base.width / (2 * LIMIT);
      g.save();
      g.translate(size / 2, size / 2);
      g.scale(ppm / k, ppm / k);
      g.translate(-(s.x + LIMIT) * k, -(s.z + LIMIT) * k);
      g.drawImage(base, 0, 0);
      g.restore();
      const to = (x: number, z: number): [number, number] => [size / 2 + (x - s.x) * ppm, size / 2 + (z - s.z) * ppm];
      g.fillStyle = "#6b6878";
      for (const [x, z] of s.opened) {
        const [a, b] = to(x, z);
        g.fillRect(a - 2, b - 2, 4, 4);
      }
      g.fillStyle = "#3dff8a";
      for (const [x, z] of s.cardBoxes) {
        const [a, b] = to(x, z);
        g.beginPath();
        g.arc(a, b, 3.5, 0, 7);
        g.fill();
      }
      g.fillStyle = "#e8e4f0";
      for (const [x, z] of s.cars) {
        const [a, b] = to(x, z);
        g.fillRect(a - 1.5, b - 1.5, 3, 3);
      }
      const [hx, hy] = to(0, 0);
      g.fillStyle = "#ffb02e";
      g.fillRect(Math.max(4, Math.min(size - 12, hx - 5)), Math.max(4, Math.min(size - 12, hy - 5)), 10, 10);
      g.fillStyle = "#120d1c";
      g.font = "8px 'Press Start 2P'";
      g.textAlign = "center";
      g.fillText("H", Math.max(9, Math.min(size - 7, hx)), Math.max(13, Math.min(size - 3, hy + 4)));
      g.save();
      g.translate(size / 2, size / 2);
      g.rotate(-s.facing + Math.PI);
      g.fillStyle = def.color;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(0, 2);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
    }, 120);
    return () => clearInterval(id);
  }, [def.color]);

  const openModal = (m: "map" | "pause") => {
    sfx.blip();
    if (world.current) world.current.paused = true;
    setModal(m);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "KeyN" && !modal) nextTrack();
      if (e.code === "KeyM") modal === "map" ? resume() : !modal && openModal("map");
      if (e.code === "Escape" || e.code === "KeyP") modal === "pause" || modal === "map" || modal === "shop" || modal === "bed" ? resume() : !modal && openModal("pause");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const quest = currentQuest(p.save);
  const [track, setTrack] = useState(trackName());
  useEffect(() => onTrack(setTrack), []);
  const resume = () => {
    setModal(null);
    if (world.current) world.current.paused = false;
  };

  // touch: joystick on the left, camera drag on the right
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y?: number } | null>(null);

  const cards = foundCount(p.save);

  return (
    <div className="play">
      <canvas ref={canvas} className="world" />
      {hud.ability && def.ability.id === "nightVision" && <div className="nightVision" />}

      <div className="hudTL">
        <div className="who" style={{ borderColor: def.color }}>
          <b style={{ color: def.color }}>{def.name}</b>
          <span>{def.ability.name}</span>
        </div>
        <div className="stats">
          <span>
            CARDS {cards}/{CARDS.length}
          </span>
          <span>COINS {p.save.coins}</span>
        </div>
        {quest && (
          <div className="quest">
            <small>QUEST</small>
            <b>{quest.title}</b>
            <span>
              {Math.min(quest.progress(p.save)[0], quest.progress(p.save)[1])}/{quest.progress(p.save)[1]} · +{quest.reward} coins
            </span>
          </div>
        )}
        {track && (
          <div className="radio">
            <span>♪ {track}</span>
            <button onClick={() => nextTrack()} aria-label="Next track">
              ▶▶
            </button>
          </div>
        )}
      </div>
      <div className="hudTR">
        <canvas ref={mapRef} width={132} height={132} className="minimap" onClick={() => openModal("map")} />
        <div className="pills">
          <button className="pill" onClick={() => openModal("map")}>
            MAP
          </button>
          <button className="pill" onClick={() => openModal("pause")}>
            II
          </button>
        </div>
      </div>

      {hud.radar && (
        <div className="radar">
          <span style={{ transform: `rotate(${-hud.radar.angle}rad)` }}>▲</span>
          CARD {Math.round(hud.radar.dist)}m
        </div>
      )}

      {hud.prompt && !modal && !talk && (
        <div className="prompt">
          <kbd>{touch ? (hud.carPrompt ? "CAR" : "B") : hud.carPrompt ? "F" : "E"}</kbd> {hud.prompt}
        </div>
      )}
      {hud.speed !== null && (
        <div className="speedo">
          <b>{hud.speed}</b>
          <span>KM/H</span>
        </div>
      )}
      {!hud.prompt && !touch && !modal && (
        <div className="keys">
          {hud.speed !== null
            ? "W gas · S brake / reverse · A D steer · SPACE handbrake · H horn · F get out"
            : hud.inside
              ? "WASD move · E use · drag to look · Esc pause"
              : `WASD move · SPACE jump · E open / ${def.ability.name.toLowerCase()} · F get in a car · M map · drag to look`}
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.card && <CardChip color={cardById(t.card).color} dark={cardById(t.card).dark} small />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {touch && !modal && !talk && (
        <>
          <div
            className="stick"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              stick.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }}
            onPointerMove={(e) => {
              const s = stick.current;
              if (!s || s.id !== e.pointerId) return;
              let dx = (e.clientX - s.x) / 50,
                dy = (e.clientY - s.y) / 50;
              const l = Math.hypot(dx, dy);
              if (l > 1) {
                dx /= l;
                dy /= l;
              }
              input.mx = dx;
              input.mz = -dy;
              setKnob({ x: dx * 36, y: dy * 36 });
            }}
            onPointerUp={() => {
              stick.current = null;
              input.mx = input.mz = 0;
              setKnob({ x: 0, y: 0 });
            }}
            onPointerCancel={() => {
              stick.current = null;
              input.mx = input.mz = 0;
              setKnob({ x: 0, y: 0 });
            }}
          >
            <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
          </div>
          <div
            className="lookPad"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== e.pointerId) return;
              input.camDX += (e.clientX - d.x) * 1.4;
              input.camDY += e.clientY - (d.y ?? e.clientY);
              d.y = e.clientY;
              input.lastDrag = performance.now();
              d.x = e.clientX;
            }}
            onPointerUp={() => (drag.current = null)}
          />
          <div className="abBtns">
            <button
              className="tb car"
              onPointerDown={(e) => {
                e.preventDefault();
                input.carPressed = true;
              }}
            >
              CAR
            </button>
            <button
              className="tb b"
              onPointerDown={(e) => {
                e.preventDefault();
                input.actionPressed = true;
              }}
            >
              B
            </button>
            <button
              className="tb a"
              onPointerDown={(e) => {
                e.preventDefault();
                input.jumpPressed = true;
                input.jumpHeld = true;
              }}
              onPointerUp={() => (input.jumpHeld = false)}
              onPointerCancel={() => (input.jumpHeld = false)}
            >
              A
            </button>
          </div>
        </>
      )}

      {talk && (
        <div
          className="dialog"
          onClick={() => {
            sfx.blip();
            if (talk.line + 1 < TALK[talk.who].length) setTalk({ ...talk, line: talk.line + 1 });
            else {
              setTalk(null);
              if (world.current) world.current.paused = false;
            }
          }}
        >
          <b style={{ color: charById(talk.who).color }}>{charById(talk.who).name}</b>
          <p>{TALK[talk.who][talk.line]}</p>
          <span className="more">▼ TAP</span>
        </div>
      )}

      {modal === "gameboy" && (
        <Gameboy
          save={p.save}
          gold={p.save.owned.includes("gold")}
          onSave={(s) => {
            world.current?.updateShelf(apply(() => s));
          }}
          onClose={() => {
            music("house");
            resume();
          }}
        />
      )}

      {modal === "wardrobe" && (
        <div className="modal full">
          <Select
            initial={p.save.char}
            title="CHANGE PLAYER"
            onBack={resume}
            onPick={(c) => {
              apply((s) => ({ ...s, char: c }));
              world.current?.setCharacter(c);
              resume();
            }}
          />
        </div>
      )}

      {modal === "bed" && (
        <div className="modal">
          <div className="sheet">
            <h3>TAKE A NAP?</h3>
            <p>Every box in the city is closed again and refilled. New memory cards are waiting out there.</p>
            <div className="row">
              <button className="gbBtn" onClick={resume}>
                NOT YET
              </button>
              <button
                className="gbBtn primary"
                onClick={() => {
                  const next = apply((s) => newHunt(s));
                  world.current?.setHunt(next);
                  world.current?.sleep();
                  sfx.win();
                  toast({ kind: "info", text: "Good morning! The boxes are full again." });
                  resume();
                }}
              >
                SLEEP
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "shop" && (
        <div className="modal">
          <div className="sheet wide">
            <h3>VENDING MACHINE · {p.save.coins} COINS</h3>
            {SHOP.map((it) => {
              const have = it.id === "scanner" ? scannerOn(p.save) : p.save.owned.includes(it.id);
              return (
                <div key={it.id} className="shopRow">
                  <div>
                    <b>{it.title}</b>
                    <p>{it.text}</p>
                  </div>
                  <button
                    className="gbBtn primary"
                    disabled={have || p.save.coins < it.price}
                    onClick={() => {
                      const n = buy(saveRef.current, it.id);
                      if (!n) return;
                      apply(() => n);
                      sfx.coin();
                    }}
                  >
                    {have ? (it.repeat ? "ACTIVE" : "OWNED") : `${it.price} C`}
                  </button>
                </div>
              );
            })}
            <p className="tip">Earn coins from boxes, street coins and quests.</p>
            <div className="row">
              <button className="gbBtn" onClick={resume}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "map" && world.current && <BigMap world={world.current} color={def.color} onClose={resume} />}

      {modal === "pause" && (
        <div className="modal">
          <div className="sheet">
            <h3>PAUSED</h3>
            <div className="opts">
              <label>
                <span>MUSIC</span>
                <button
                  onClick={() => {
                    setAudio("music", !aud.music);
                    setAud(audioState());
                  }}
                >
                  {aud.music ? "ON" : "OFF"}
                </button>
              </label>
              <label>
                <span>SOUND</span>
                <button
                  onClick={() => {
                    setAudio("sfx", !aud.sfx);
                    setAud(audioState());
                  }}
                >
                  {aud.sfx ? "ON" : "OFF"}
                </button>
              </label>
            </div>
            <div className="questList">
              {QUESTS.map((q) => {
                const [a, b] = q.progress(p.save);
                const done = p.save.quests.includes(q.id);
                return (
                  <div key={q.id} className={done ? "done" : ""}>
                    <span>{done ? "✔" : "○"} {q.title}</span>
                    <em>{done ? "DONE" : `${Math.min(a, b)}/${b} · +${q.reward}`}</em>
                  </div>
                );
              })}
            </div>
            <p className="tip">Tip: go back to the Game House (the H on the map) to play your memory cards. Sleep in the bed to refill every box.</p>
            <div className="row">
              <button className="gbBtn" onClick={p.onQuit}>
                QUIT TO TITLE
              </button>
              <button className="gbBtn primary" onClick={resume}>
                ▶ RESUME
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BigMap({ world, color, onClose }: { world: World; color: string; onClose(): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!,
      g = cv.getContext("2d")!,
      S = cv.width,
      k = S / (2 * LIMIT);
    const s = world.mapState();
    g.imageSmoothingEnabled = false;
    g.drawImage(world.city.map, 0, 0, S, S);
    const to = (x: number, z: number): [number, number] => [(x + LIMIT) * k, (z + LIMIT) * k];
    const dot = (x: number, z: number, c: string, r: number) => {
      const [a, b] = to(x, z);
      g.fillStyle = c;
      g.beginPath();
      g.arc(a, b, r, 0, 7);
      g.fill();
    };
    for (const [x, z] of s.opened) dot(x, z, "#3a3836", 3);
    for (const [x, z] of s.cardBoxes) dot(x, z, "#3dff8a", 6);
    const [hx, hz] = to(0, -1);
    g.fillStyle = "#ffb02e";
    g.fillRect(hx - 12, hz - 12, 24, 24);
    g.fillStyle = "#120d1c";
    g.font = "14px 'Press Start 2P'";
    g.textAlign = "center";
    g.fillText("H", hx + 1, hz + 7);
    g.font = "9px 'Press Start 2P'";
    g.fillStyle = "#fff";
    const [px1, pz1] = to(-34, 0);
    g.fillText("PARK", px1, pz1);
    const [sx1, sz1] = to(34, 0);
    g.fillText("STATION", sx1, sz1);
    const [x, z] = to(s.x, s.z);
    g.save();
    g.translate(x, z);
    g.rotate(-s.facing + Math.PI);
    g.fillStyle = color;
    g.strokeStyle = "#000";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(8, 8);
    g.lineTo(0, 3);
    g.lineTo(-8, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }, [world, color]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet wide" onClick={(e) => e.stopPropagation()}>
        <h3>CITY MAP</h3>
        <canvas ref={ref} width={560} height={560} className="bigMap" />
        <p className="tip">H = Game House · grey dots = boxes you opened · green dots = card boxes (needs the Card Scanner from the vending machine)</p>
        <div className="row">
          <button className="gbBtn primary" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
