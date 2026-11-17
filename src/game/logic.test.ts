import { CARDS, fillBoxes, newSave, openBox, newHunt, recordScore, starsFor } from "./data";
const ok = (c: boolean, m: string) => { if (!c) { console.error("FAIL", m); process.exit(1); } };
for (const seed of [1, 42, 999, 123456]) {
  const b = fillBoxes(36, seed);
  ok(b.length === 36, "count");
  for (const c of CARDS) ok(b.some((x) => x.kind === "card" && x.card === c.id), `every colour once (seed ${seed}, ${c.id})`);
  ok(b.filter((x) => x.kind === "card").length <= 8, "only a few cards");
  ok(JSON.stringify(b) === JSON.stringify(fillBoxes(36, seed)), "same seed same boxes");
}
let s = newSave("noir");
s = openBox(s, 3, { kind: "coins", n: 4 });
ok(s.coins === 4 && s.opened.includes(3), "coins");
ok(openBox(s, 3, { kind: "coins", n: 4 }).coins === 4, "box opens once");
s = openBox(s, 5, { kind: "card", card: "purple" });
ok(s.cards.purple.found && s.cards.purple.copies === 1, "card found");
s = openBox(s, 6, { kind: "card", card: "purple" });
ok(s.coins === 14 && s.cards.purple.copies === 2, "duplicate gives coins");
const r = recordScore(s, "purple", 900);
ok(r.stars === 2 && r.save.cards.purple.best === 900 && r.newBest, "score");
ok(starsFor(CARDS[0], 0) === 0 && starsFor(CARDS[0], 99999) === 3, "stars");
const h = newHunt(s);
ok(h.opened.length === 0 && h.hunt !== s.hunt, "new hunt");
console.log("logic tests passed");
