import { useEffect, useRef, useState } from "react";
import { CARDS, cardById, recordScore, type CardDef, type Save } from "../game/data";
import { music, sfx } from "../game/audio";
import { createGame } from "../minigames/games";
import { C, H, newPad, text, W, type MiniGame } from "../minigames/lcd";
import { CardChip } from "./Common";

type Phase = "pick" | "boot" | "play" | "over";

export default function Gameboy(p: { save: Save; gold?: boolean; onSave(s: Save): void; onClose(): void }) {
  const owned = CARDS.filter((c) => p.save.cards[c.id]?.found);
  const [sel, setSel] = useState(0);
  const [card, setCard] = useState<CardDef | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [result, setResult] = useState<{ score: number; best: number; stars: number; newBest: boolean } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const pad = useRef(newPad());
  const saveRef = useRef(p.save);
  saveRef.current = p.save;

  // keyboard to pad
  useEffect(() => {
    const map: Record<string, keyof typeof pad.current> = {
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      Space: "a", KeyK: "a", KeyJ: "b", KeyE: "b", ShiftLeft: "b",
    };
    const down = (e: KeyboardEvent) => {
      const k = map[e.code];
      e.stopPropagation();
      if (e.code === "Escape") return close();
      if (e.code === "Enter") return press("start");
      if (!k || e.repeat) return;
      press(k as "left" | "right" | "up" | "down" | "a" | "b");
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) release(k as "left" | "right" | "up" | "down" | "a" | "b");
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  });

  const press = (k: "left" | "right" | "up" | "down" | "a" | "b" | "start") => {
    const pd = pad.current;
    if (k === "start") pd.startPressed = true;
    else {
      (pd as unknown as Record<string, boolean>)[k] = true;
      if (k === "a") pd.aPressed = true;
      else if (k === "b") pd.bPressed = true;
      else pd.dirPressed = k;
    }
  };
  const release = (k: "left" | "right" | "up" | "down" | "a" | "b") => {
    (pad.current as unknown as Record<string, boolean>)[k] = false;
  };

  const close = () => {
    sfx.back();
    p.onClose();
  };

  // card picker reacts to the pad too
  useEffect(() => {
    if (phase !== "pick" && phase !== "over") return;
    const id = setInterval(() => {
      const pd = pad.current;
      if (phase === "pick" && owned.length) {
        if (pd.dirPressed === "left" || pd.dirPressed === "up") {
          setSel((s) => (s + owned.length - 1) % owned.length);
          sfx.blip();
        }
        if (pd.dirPressed === "right" || pd.dirPressed === "down") {
          setSel((s) => (s + 1) % owned.length);
          sfx.blip();
        }
        if (pd.aPressed || pd.startPressed) insert(owned[sel]);
        if (pd.bPressed) close();
      }
      if (phase === "over") {
        if (pd.aPressed || pd.startPressed) start(card!);
        if (pd.bPressed) {
          setPhase("pick");
          music("house");
        }
      }
      pd.aPressed = pd.bPressed = pd.startPressed = false;
      pd.dirPressed = null;
    }, 50);
    return () => clearInterval(id);
  });

  const insert = (c: CardDef) => {
    sfx.select();
    setCard(c);
    start(c);
  };

  const start = (c: CardDef) => {
    setResult(null);
    setPhase("boot");
    music("off");
  };

  // boot animation + game loop on the LCD
  useEffect(() => {
    if ((phase !== "boot" && phase !== "play") || !card) return;
    const g = cv.current!.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    let raf = 0,
      last = performance.now(),
      bootT = phase === "boot" ? 0 : 99;
    let game: MiniGame | null = phase === "play" ? null : null;
    const pd = pad.current;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (bootT < 1.9) {
        bootT += dt;
        g.fillStyle = C[3];
        g.fillRect(0, 0, W, H);
        const y = Math.min(56, -10 + bootT * 70);
        text(g, "NULLS", W / 2, y, C[0], "center", 16);
        if (bootT > 1.0) text(g, card.title, W / 2, 84, C[1], "center");
        if (bootT > 1.0 && bootT < 1.1) sfx.coin();
        if (bootT >= 1.9) {
          pd.aPressed = pd.bPressed = pd.startPressed = false;
          pd.dirPressed = null;
          game = createGame(card.game, pd, saveRef.current.char);
          music("game");
        }
        return;
      }
      if (!game) return;
      if (pd.startPressed) {
        pd.startPressed = false;
        // quit early counts the score so far
        finish(game.score());
        cancelAnimationFrame(raf);
        return;
      }
      const alive = game.update(dt);
      pd.aPressed = pd.bPressed = false;
      pd.dirPressed = null;
      game.draw(g);
      if (!alive) {
        cancelAnimationFrame(raf);
        setTimeout(() => finish(game!.score()), 500);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "boot", card]);

  const finish = (score: number) => {
    if (!card) return;
    const r = recordScore(saveRef.current, card.id, score);
    p.onSave(r.save);
    setResult({ score, best: r.save.cards[card.id].best, stars: r.save.cards[card.id].stars, newBest: r.newBest });
    setPhase("over");
    music("off");
    if (r.newBest && score > 0) sfx.win();
    else sfx.gameOver();
  };

  const lcd = phase === "boot" || phase === "play";

  return (
    <div className="modal gbModal">
      <div className={`gbBig${p.gold ? " gold" : ""}`}>
        <div className="gbBigTop">
          <span className="gbLed on" />
          <div className="gbBigScreen">
            {lcd && <canvas ref={cv} width={W} height={H} className="lcdCanvas" />}
            {phase === "pick" && (
              <div className="lcd pick">
                {owned.length === 0 ? (
                  <>
                    <p className="lcdSub">NO CARD</p>
                    <p className="lcdSmall">Find memory cards in the boxes around the city first!</p>
                  </>
                ) : (
                  <>
                    <p className="lcdSmall">INSERT MEMORY CARD</p>
                    <p className="lcdSub">{owned[sel % owned.length].title}</p>
                    <p className="lcdSmall">{owned[sel % owned.length].blurb}</p>
                    <p className="lcdSmall">
                      BEST {p.save.cards[owned[sel % owned.length].id].best} {"★".repeat(p.save.cards[owned[sel % owned.length].id].stars)}
                      {"☆".repeat(3 - p.save.cards[owned[sel % owned.length].id].stars)}
                    </p>
                  </>
                )}
              </div>
            )}
            {phase === "over" && result && card && (
              <div className="lcd pick">
                <p className="lcdSub">GAME OVER</p>
                <p className="lcdSmall">SCORE {result.score}</p>
                <p className="lcdSmall">{result.newBest && result.score > 0 ? "NEW BEST!" : `BEST ${result.best}`}</p>
                <p className="lcdStars">
                  {"★".repeat(result.stars)}
                  {"☆".repeat(3 - result.stars)}
                </p>
                <p className="lcdSmall">A RETRY · B CARDS</p>
              </div>
            )}
          </div>
          <p className="gbBrand">
            Nulls <i>GAME BOY</i>
          </p>
        </div>
        <div className="gbControls">
          <div className="dpadReal">
            {(["up", "left", "right", "down"] as const).map((d) => (
              <button
                key={d}
                className={d}
                aria-label={d}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(d);
                }}
                onPointerUp={() => release(d)}
                onPointerLeave={() => release(d)}
                onPointerCancel={() => release(d)}
              />
            ))}
            <span className="mid" />
          </div>
          <div className="abReal">
            {(["b", "a"] as const).map((k) => (
              <button
                key={k}
                className={k}
                onPointerDown={(e) => {
                  e.preventDefault();
                  press(k);
                }}
                onPointerUp={() => release(k)}
                onPointerLeave={() => release(k)}
                onPointerCancel={() => release(k)}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="gbStartRow">
          <button onClick={close}>SELECT · EXIT</button>
          <button onPointerDown={() => press("start")}>START</button>
        </div>
      </div>

      {(phase === "pick" || phase === "over") && (
        <div className="cardShelf">
          {CARDS.map((c) => {
            const has = p.save.cards[c.id]?.found;
            const idx = owned.findIndex((o) => o.id === c.id);
            return (
              <button
                key={c.id}
                className={`shelfCard${has ? "" : " locked"}${phase === "pick" && idx === sel ? " on" : ""}`}
                disabled={!has}
                onClick={() => {
                  if (idx >= 0) {
                    setSel(idx);
                    insert(c);
                  }
                }}
              >
                {has ? <CardChip color={c.color} dark={c.dark} small /> : <span className="unknown">?</span>}
                <span>{has ? c.title : "NOT FOUND"}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="gbHelp">
        {phase === "play" || phase === "boot"
          ? "Arrows / D-pad move · Space or A = A · START (Enter) quits"
          : "Pick a memory card to insert it · Esc to step away"}
      </p>
    </div>
  );
}

export { cardById };
