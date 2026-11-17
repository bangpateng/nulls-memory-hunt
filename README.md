# Nulls: Memory Hunt

A free, offline 3D open-city game in the browser, made for the Nulls community. No wallet, no login. Anyone can play.

Pick one of the four Nulls, explore a sunny city with traffic and pedestrians, get in any car and drive, and search boxes and crates around town for the lost memory cards. Take them to the Game House and play them on the old Gameboy.

> Unofficial fan project. Not affiliated with Nulls. Built by [@naxweb3](https://x.com/naxweb3).

## Features

- Open city of 25 blocks: apartment, brick, concrete and glass buildings over shopfronts, sidewalks, parking lots, a park, the station and the Game House
- Traffic that stops at red lights, parked cars, pedestrians on the sidewalks
- Get in any car (F) and drive: gas, brake, reverse, handbrake
- Always daytime, with the sun slowly moving across the sky
- Nulls Radio: 10 original hip-hop instrumentals generated in code (boom bap, trap, lo-fi, drill, west coast). N skips to the next track
- Sound effects for crashes, skids, horns, footsteps, pedestrians and city ambience
- A furnished Game House: Gameboy on a lit pedestal, wall screen, card showcase, arcade cabinet, bedroom corner, lounge and posters of the four Nulls
- 4 playable Nulls, each with a power that helps the hunt:
  - **Rhea**: double jump to reach rooftop boxes
  - **Noir Wallet**: card vision, boxes that hold a card glow green
  - **Meteora Wallet**: dash
  - **naxweb3**: gold radar that points to the nearest card
- Boxes can be empty, hold coins, or hold a memory card in a random colour. Sleep in the Game House to refill every box
- 4 memory cards, 4 retro games on a 160x144 green Gameboy screen: Null Run, Bomb Dodge, Null Breaker, Memory Flip. Best scores and up to 3 stars per card
- 10 quests that pay coins, street coins to collect, and a vending machine shop in the Game House (card scanner, turbo sneakers, gold Gameboy)
- City map (M) and a quest list in the pause menu (Esc)
- Buildings with real 3D detail: awnings, balconies, fire escapes, ledges, rooftop billboards
- Progress saves automatically in the browser
- Works on desktop (keyboard and mouse) and phones (touch stick and buttons)
- No image or model files: every texture, building, car and character is generated in code

## Controls

| On foot | Driving | Phone |
| --- | --- | --- |
| WASD walk | W gas, S brake or reverse | Left stick moves or steers |
| Space jump | A D steer | Drag on the right to look |
| E open box, talk, power | Space handbrake | A jump, B open or power |
| F get in a car | F get out | CAR get in or out |
| Drag the mouse to look, M map, Esc pause | H horn | Tap the minimap for the map |

## Run it

Needs Node.js 18 or newer.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm test         # game logic tests
```

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New Project** and import the repository.
3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist`.
4. Deploy. No environment variables are needed.

## Graphics setting

Settings on the front page has **HIGH** (real-time shadows, more pedestrians) and **FAST** (for phones and older laptops). Phones start on FAST.

## Project layout

```
src/
  App.tsx                 screens: landing, player select, game
  components/
    Landing.tsx           front page with the 3D hero
    Hero3D.tsx            the street corner scene on the front page
    Select.tsx            player select
    Play.tsx              HUD, minimap, touch controls, dialogs
    Gameboy.tsx           the Gameboy that plays memory cards
  game/
    world.ts              the running game: walking, driving, traffic, camera, daylight
    city.ts               the city layout, buildings, street furniture, traffic lights
    textures.ts           procedural textures (asphalt, facades, shopfronts...)
    vehicles.ts           car models
    peds.ts               pedestrians
    characters.ts         the four Nulls
    props.ts              boxes, memory cards, Game House interior
    fx.ts                 sky, sun and moon, bloom
    audio.ts              chiptune music and sound effects
    data.ts               characters, cards, save data and rules
  minigames/
    lcd.ts, games.ts      the four Gameboy games
```
