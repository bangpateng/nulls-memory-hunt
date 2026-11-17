import { useEffect, useState } from "react";
import Hero3D from "./Hero3D";
import { CardChip, Logo } from "./Common";
import { CARDS, CHARACTERS, QUESTS, type Save } from "../game/data";
import { audioState, music, nextTrack, onTrack, playTrack, setAudio, sfx, trackList, trackName } from "../game/audio";

const FEATURES: [string, string, string][] = [
  ["OPEN CITY", "25 blocks to explore", "Shops, apartments, a park, the station and back alleys. Every corner can hide a box."],
  ["DRIVE", "Take any car", "Sedans, taxis, vans and pickups. Gas, brake, handbrake, horn. Traffic stops at red lights."],
  ["HUNT", "Random loot", "Boxes hold nothing, coins, or a memory card in a random colour. Sleep to refill the city."],
  ["PLAY", "4 Gameboy games", "Null Run, Bomb Dodge, Null Breaker and Memory Flip on a real 160x144 green screen."],
  ["QUESTS", `${QUESTS.length} quests, a shop`, "Earn coins, buy the card scanner, turbo sneakers and a gold Gameboy."],
  ["RADIO", "10 hip-hop beats", "Original instrumentals play while you roam. Skip tracks any time."],
];
const SHOTS: [string, string][] = [
  ["city", "Downtown"],
  ["drive", "Behind the wheel"],
  ["house", "Inside the Game House"],
  ["hunt", "Box hunting"],
];

export default function Landing(p: { save: Save | null; quality: "high" | "low"; onQuality(q: "high" | "low"): void; onContinue(): void; onNew(): void }) {
  const [opts, setOpts] = useState(false);
  const [aud, setAud] = useState(audioState());
  const [scrolled, setScrolled] = useState(false);
  const [track, setTrack] = useState(trackName());
  useEffect(() => onTrack(setTrack), []);
  const found = p.save ? CARDS.filter((c) => p.save!.cards[c.id]?.found).length : 0;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const play = p.save ? p.onContinue : p.onNew;

  return (
    <div className="lp" onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 40)}>
      <nav className={`lpNav${scrolled ? " solid" : ""}`}>
        <button className="lpBrand" onClick={() => go("top")}>
          <Logo size={38} />
          <span>
            NULLS<em>MEMORY HUNT</em>
          </span>
        </button>
        <div className="lpLinks">
          {[
            ["game", "The game"],
            ["world", "World"],
            ["players", "Players"],
            ["cards", "Memory cards"],
            ["music", "Soundtrack"],
          ].map(([id, t]) => (
            <button key={id} onClick={() => go(id)}>
              {t}
            </button>
          ))}
        </div>
        <button className="lpPlay" onClick={play}>
          PLAY NOW
        </button>
      </nav>

      <header className="lpHero" id="top">
        <Hero3D lite={p.quality === "low"} />
        <div className="lpShade" />
        <div className="lpHeroIn">
          <span className="lpBadge">FREE TO PLAY · NO DOWNLOAD · NO WALLET</span>
          <h1>
            THE WORLD OF NULLS
            <span>IS COMING TO NEAR</span>
          </h1>
          <p>Roam an open city on foot or behind the wheel, hunt the lost memory cards, and play them on the old Gameboy.</p>
          <div className="lpBtns">
            <button className="lpCta" onClick={play}>
              ▶ {p.save ? "CONTINUE" : "PLAY NOW"}
            </button>
            {p.save && (
              <button className="lpGhost" onClick={p.onNew}>
                NEW GAME
              </button>
            )}
            <button
              className="lpGhost"
              onClick={() => {
                sfx.blip();
                setOpts(true);
              }}
            >
              SETTINGS
            </button>
          </div>
          {p.save && (
            <p className="lpProg">
              Your save: {found}/4 memory cards · {p.save.coins} coins · {p.save.quests.length}/{QUESTS.length} quests
            </p>
          )}
        </div>
        <div className="lpStats">
          {[
            ["4", "Playable Nulls"],
            ["25", "City blocks"],
            ["4", "Retro games"],
            [String(QUESTS.length), "Quests"],
            ["10", "Radio tracks"],
          ].map(([n, t]) => (
            <div key={t}>
              <b>{n}</b>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </header>

      <section id="game" className="lpSec">
        <header>
          <small>THE GAME</small>
          <h2>One city. Four memory cards. Find them all.</h2>
          <p>Pick your Null, search the streets, bring the cards home and beat every game for three stars.</p>
        </header>
        <div className="lpBento">
          {FEATURES.map(([tag, title, text], i) => (
            <article key={tag} className={`f${i}`}>
              <small>{tag}</small>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="world" className="lpSec">
        <header>
          <small>THE WORLD</small>
          <h2>Screenshots</h2>
        </header>
        <div className="lpShots">
          {SHOTS.map(([f, t], i) => (
            <figure key={f} className={i === 0 ? "big" : ""}>
              <img src={`/shots/${f}.jpg`} alt={t} loading="lazy" />
              <figcaption>{t}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="players" className="lpSec">
        <header>
          <small>PLAYER SELECT</small>
          <h2>Meet the Nulls</h2>
          <p>Four players, each with a power that changes how you hunt.</p>
        </header>
        <div className="lpPlayers">
          {CHARACTERS.map((c) => (
            <article key={c.id} style={{ ["--bg" as string]: c.bg }}>
              <div className="img">
                <img src={`/art/${c.id}.jpg`} alt={c.name} loading="lazy" />
              </div>
              <div className="info">
                <small>{c.tag}</small>
                <h3>{c.name}</h3>
                <b>{c.ability.name}</b>
                <p>{c.ability.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="cards" className="lpSec">
        <header>
          <small>DO NOT ERASE</small>
          <h2>Four memory cards, four games</h2>
        </header>
        <div className="lpCards">
          {CARDS.map((c) => {
            const cs = p.save?.cards[c.id];
            return (
              <article key={c.id} style={{ ["--c" as string]: c.color }}>
                <CardChip color={c.color} dark={c.dark} />
                <div>
                  <h3>{c.title}</h3>
                  <p>{c.blurb}</p>
                  <span>{cs?.found ? `FOUND · BEST ${cs.best} · ${"★".repeat(cs.stars)}${"☆".repeat(3 - cs.stars)}` : "NOT FOUND YET"}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="music" className="lpSec">
        <header>
          <small>SOUNDTRACK</small>
          <h2>Nulls Radio</h2>
          <p>Ten original hip-hop instrumentals, from boom bap to trap and drill. Tap a track to play it.</p>
        </header>
        <div className="lpTracks">
          {trackList().map((t, i) => (
            <button
              key={t}
              className={track === t ? "on" : ""}
              onClick={() => {
                if (!audioState().music) {
                  setAudio("music", true);
                  setAud(audioState());
                }
                music("title");
                playTrack(i);
              }}
            >
              <i>{String(i + 1).padStart(2, "0")}</i>
              <b>{t}</b>
              <span>{track === t ? "PLAYING" : "▶"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lpSec lpControls">
        <header>
          <small>CONTROLS</small>
          <h2>Keyboard or touch</h2>
        </header>
        <div>
          <article>
            <h3>On foot</h3>
            <ul>
              <li><kbd>W A S D</kbd> walk</li>
              <li><kbd>Space</kbd> jump</li>
              <li><kbd>E</kbd> open, talk, use power</li>
              <li><kbd>F</kbd> get in a car</li>
              <li><kbd>M</kbd> map · <kbd>N</kbd> next track · <kbd>Esc</kbd> pause</li>
            </ul>
          </article>
          <article>
            <h3>Driving</h3>
            <ul>
              <li><kbd>W</kbd> gas · <kbd>S</kbd> brake, reverse</li>
              <li><kbd>A D</kbd> steer</li>
              <li><kbd>Space</kbd> handbrake · <kbd>H</kbd> horn</li>
              <li><kbd>F</kbd> get out</li>
            </ul>
          </article>
          <article>
            <h3>Phone</h3>
            <ul>
              <li>Left stick to move or steer</li>
              <li>Drag on the right to look</li>
              <li><b>A</b> jump · <b>B</b> open or power</li>
              <li><b>CAR</b> get in and out</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="lpFinal">
        <Logo size={72} />
        <h2>Ready to hunt?</h2>
        <button className="lpCta" onClick={play}>
          ▶ {p.save ? "CONTINUE" : "PLAY NOW"}
        </button>
      </section>

      <footer className="lpFoot">
        <div className="lpBrand">
          <Logo size={30} />
          <span>
            NULLS<em>MEMORY HUNT</em>
          </span>
        </div>
        <span>Unofficial fan project. Not affiliated with Nulls.</span>
        <a href="https://x.com/naxweb3" target="_blank" rel="noopener noreferrer">
          Built by @naxweb3
        </a>
      </footer>

      {track && (
        <div className="lpNow">
          <i />
          <span>
            <small>NOW PLAYING</small>
            {track}
          </span>
          <button onClick={() => nextTrack()} aria-label="Next track">
            ▶▶
          </button>
        </div>
      )}

      {opts && (
        <div className="modal" onClick={() => setOpts(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>SETTINGS</h3>
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
              <label>
                <span>GRAPHICS</span>
                <button onClick={() => p.onQuality(p.quality === "high" ? "low" : "high")}>{p.quality === "high" ? "HIGH" : "FAST"}</button>
              </label>
            </div>
            <p className="tip">HIGH adds real-time shadows and more people on the streets. Use FAST on phones and older laptops.</p>
            <div className="row">
              <button className="gbBtn primary" onClick={() => setOpts(false)}>
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
