import { useEffect, useState } from "react";
import { attachKeyboard } from "./game/input";
import { music, sfx, unlockAudio } from "./game/audio";
import { eraseSave, loadSave, newSave, storeSave, type CharId, type Save } from "./game/data";
import Landing from "./components/Landing";
import Select from "./components/Select";
import Play from "./components/Play";

type Screen = "title" | "select" | "play";

export default function App() {
  const [save, setSave] = useState<Save | null>(() => loadSave());
  const [screen, setScreen] = useState<Screen>("title");
  const [quality, setQuality] = useState<"high" | "low">(() => {
    const q = localStorage.getItem("nulls-quality");
    if (q === "high" || q === "low") return q;
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "low" : "high";
  });

  useEffect(() => {
    attachKeyboard();
    const go = () => unlockAudio();
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
  }, []);

  useEffect(() => {
    if (screen === "title" || screen === "select") music("title");
  }, [screen]);

  const update = (s: Save) => {
    setSave(s);
    storeSave(s);
  };

  return (
    <>
      {screen === "title" && (
        <Landing
          save={save}
          quality={quality}
          onQuality={(q) => {
            setQuality(q);
            localStorage.setItem("nulls-quality", q);
          }}
          onContinue={() => {
            sfx.select();
            setScreen("play");
          }}
          onNew={() => {
            sfx.select();
            if (save && !window.confirm("Start a new game? Your memory cards will be erased.")) return;
            eraseSave();
            setSave(null);
            setScreen("select");
          }}
        />
      )}
      {screen === "select" && (
        <Select
          initial={save?.char ?? "rhea"}
          onBack={() => setScreen("title")}
          onPick={(c: CharId) => {
            update({ ...(save ?? newSave(c)), char: c });
            setScreen("play");
          }}
        />
      )}
      {screen === "play" && save && <Play save={save} quality={quality} onSave={update} onQuit={() => setScreen("title")} />}
      {screen === "play" && !save && <Select initial="rhea" onBack={() => setScreen("title")} onPick={(c) => update(newSave(c))} />}
    </>
  );
}
