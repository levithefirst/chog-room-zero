// Game-library screenshots (/library): REAL frames of the game running locally in headless Chrome (SwiftShader), saved
// as WebP into library/public/library/shots/ with a manifest (size, alt text, callouts). Callout boxes are measured from
// the game's own DOM (getBoundingClientRect of the HUD element) at capture time, never drawn by hand; the library page
// draws them as an SVG over the image. States that are hard to reach by playing (low health, armour break, death,
// victory) are set through the ?debug hook (__chog.world): the frame is what the game draws for that state.
// Emulated devices, NOT real phones.
// Usage: node tools/library-shots.mjs http://localhost:8990   (ONLY=hud-desktop,tmap-metro to pick)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { browser, sleep } from './cdp.mjs';

const base = process.argv[2] ?? 'http://localhost:8990';
const OUT = path.resolve('library/public/library/shots');
const OUT_W = 1280; // stored width for desktop frames (captured at 1600x900, downscaled)
fs.mkdirSync(OUT, { recursive: true });
const manPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : {};
const only = process.env.ONLY?.split(',');
const want = (n) => !only || only.includes(n);

const key = async (b, k, code, vk, hold = 0) => { await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); if (hold) await sleep(hold); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const rects = (b, sels) => b.ev(`(${JSON.stringify(sels)}).map(([s, t]) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, t } : null; }).filter(Boolean)`);
const player = `__chog.world.actors.find((a) => a.team === 'player' && !a.ai)`;

/** Capture the viewport as WebP (Chrome encodes it), scale to `outW`, store + manifest entry. */
async function save(b, name, { vw, alt, callouts = [], outW = vw, file, staged = false }) {
  if (!want(name)) return;
  const pad = 6, k = outW / vw;
  const cs = (await rects(b, callouts)).map((c) => ({ x: Math.round((c.x - pad) * k), y: Math.round((c.y - pad) * k), w: Math.round((c.w + pad * 2) * k), h: Math.round((c.h + pad * 2) * k), t: c.t }));
  const r = await b.cmd('Page.captureScreenshot', { format: 'png' });
  const tmp = path.join('/tmp', `lib-${name}.png`);
  fs.writeFileSync(tmp, Buffer.from(r.data, 'base64'));
  const dest = path.join(OUT, `${file ?? name}.webp`);
  const dims = execFileSync('python3', ['-c', `import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert('RGB')\nw = int(sys.argv[3]); h = round(im.height * w / im.width)\nim = im.resize((w, h), Image.LANCZOS) if w != im.width else im\nim.save(sys.argv[2], 'WEBP', quality=74, method=6)\nprint(w, h)`, tmp, dest, String(outW)]).toString().trim().split(' ').map(Number);
  manifest[name] = { w: dims[0], h: dims[1], alt, callouts: cs, ...(staged ? { staged } : {}), ...(file ? { file } : {}) };
  console.log('saved', name, dims.join('x'), (fs.statSync(dest).size / 1024).toFixed(1) + ' KB', cs.length + ' callouts');
}

async function solo(b, map, { hero, touch = false, deployShot } = {}) {
  await b.go('/?debug');
  await b.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map', ${JSON.stringify(map)});`);
  await b.go('/?debug'); await b.hub(); await sleep(900);
  if (hero) await b.ev(`__chog.setHero?.(${JSON.stringify(hero)})`);
  await b.click('[data-mode=solo]');
  if (deployShot) {
    await b.cmd('Emulation.setCPUThrottlingRate', { rate: 20 });
    await b.ev(`document.getElementById('playbtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))`); await sleep(150);
    await deployShot(); await b.cmd('Emulation.setCPUThrottlingRate', { rate: 1 });
  } else if (touch) await b.ev(`document.getElementById('playbtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`);
  else await b.click('#playbtn');
  if (!(await b.until(`__chog.phase === 'play'`, 20000))) throw new Error(`${map}: no play phase`);
  await sleep(3200); // deploy card gone, lights settled
}

const D = { w: 1600, h: 900 };
const HUD = [['#vitals', 'Health (green) and armour (blue)'], ['#mapbtn', 'Tactical map (M)'], ['#foes', 'Hostiles left and the danger-zone timer'], ['#nade', 'Grenades left (G)'], ['#ability', 'Ability and its cooldown (Space or Q)'], ['#weapon', 'Weapon, magazine and reserve, reload ring']];

// ---- Desktop: one solo run on Office covers the HUD states ----
if (['deploy', 'hud-desktop', 'sound-rings', 'reload', 'ability-cd', 'low-health', 'armour-break', 'tactical-map', 'death', 'victory'].some(want)) {
  const b = await browser('lib-d', { base, ...D });
  await solo(b, 'office', { deployShot: () => save(b, 'deploy', { vw: D.w, outW: OUT_W, alt: 'The deploy briefing before a solo match: the location, its map, the squad and the operator\'s ability, shown while the room loads.' }) });
  await save(b, 'hud-desktop', { vw: D.w, outW: OUT_W, alt: 'A solo match on Office at the start: the operator in a lit room with the vision cone ahead, the HUD around the edges.', callouts: HUD });
  // Run and fire: your own footsteps and shots draw noise rings out to where they carry.
  await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await sleep(700);
  await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 300 });
  await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 300, button: 'left', clickCount: 1 }); await sleep(260);
  await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 300, button: 'left', clickCount: 1 });
  await sleep(120);
  await save(b, 'sound-rings', { vw: D.w, outW: OUT_W, alt: 'Running and firing: the dashed ring around the operator shows how far that noise carries.' });
  await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await sleep(600);
  await b.ev(`(() => { const p = ${player}; p.ammo = 3; })()`); await sleep(200);
  await key(b, 'r', 'KeyR', 82); await sleep(700);
  await save(b, 'reload', { staged: true, vw: D.w, outW: OUT_W, alt: 'Reloading: the ring around the weapon icon fills while the magazine reloads.', callouts: [['#weapon', 'Reload ring and ammo count']] });
  await sleep(2200);
  await key(b, ' ', 'Space', 32); await sleep(1400);
  await save(b, 'ability-cd', { vw: D.w, outW: OUT_W, alt: 'Benja\'s Ping just used: the sonar ring spreads out and the ability button shows its cooldown.', callouts: [['#ability', 'Ability on cooldown']] });
  await b.ev(`(() => { const p = ${player}; p.armor = 0; })()`); await sleep(220);
  await save(b, 'armour-break', { staged: true, vw: D.w, outW: OUT_W, alt: 'Armour gone: the armour bar is empty and the vitals panel flashes.', callouts: [['#vitals', 'Armour bar empty: every hit now goes to health']] });
  await b.ev(`(() => { const p = ${player}; p.hp = Math.min(p.hp, 30); })()`); await sleep(800);
  await save(b, 'low-health', { staged: true, vw: D.w, outW: OUT_W, alt: 'Low health: the health bar is short and the screen edges warn.', callouts: [['#vitals', 'Health low']] });
  await b.ev(`(() => { const p = ${player}; p.hp = p.maxHp; })()`);
  await key(b, 'm', 'KeyM', 77); await sleep(900);
  await save(b, 'tactical-map', { vw: D.w, outW: OUT_W, alt: 'The tactical map open over a match on Office: the whole floor with area names, your squad and every living hostile at its live position, zoom buttons on the right.', callouts: [['#tm-name', 'Location'], ['#tm-in', 'Zoom in'], ['#tm-fit', 'Fit the whole map'], ['#tm-close', 'Return to the match (M)']] });
  await key(b, 'm', 'KeyM', 77); await sleep(500);
  await b.ev(`(() => { const w = __chog.world; for (const a of w.actors) if (a.team === 'player' && !a.ai) { a.hp = 0; a.alive = false; } w.outcome = 'dead'; w.playerKill = { cause: 'shot', killerId: w.actors.findIndex((a) => a.team === 'bot'), weapon: 'Rifle', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: w.tick }; })()`);
  if (await b.until(`__chog.phase === 'results'`, 15000)) { await sleep(1300); await save(b, 'death', { staged: true, vw: D.w, outW: OUT_W, alt: 'RUN OVER: the results screen after losing a solo match, with time, hostiles downed, kills and accuracy.' }); }
  await b.click('[data-go=restart]'); await b.until(`__chog.phase === 'play'`, 15000); await sleep(1000);
  await b.ev(`(() => { const w = __chog.world; for (const a of w.actors) if (a.team === 'bot') { a.hp = 0; a.alive = false; } })()`);
  if (!(await b.until(`__chog.phase === 'results'`, 6000))) await b.ev(`(() => { __chog.world.outcome = 'won'; })()`);
  if (await b.until(`__chog.phase === 'results'`, 10000)) { await sleep(1300); await save(b, 'victory', { staged: true, vw: D.w, outW: OUT_W, alt: 'ROOM CLEARED: the results screen after winning a solo match, with the medals earned listed.' }); }
  if (b.errors.length) console.log('page errors', b.errors.slice(0, 5));
  await b.close();
}

// ---- The tactical map of every location ----
for (const id of ['room-zero', 'office', 'supermarket', 'metro', 'construction']) {
  if (!want(`tmap-${id}`)) continue;
  const b = await browser(`lib-${id}`, { base, ...D });
  await solo(b, id);
  await key(b, 'm', 'KeyM', 77); await sleep(1000);
  await save(b, `tmap-${id}`, { vw: D.w, outW: OUT_W, alt: `The in-game tactical map of this location, opened at the start of a solo match: the floor plan with area names, the squad's position and every hostile's live position.` });
  await b.close();
}

// ---- Touch HUD, phone landscape ----
if (want('touch-hud')) {
  const T = { w: 844, h: 390, mobile: true, touch: true };
  const b = await browser('lib-t', { base, ...T });
  await solo(b, 'office', { touch: true });
  await save(b, 'touch-hud', { vw: T.w, alt: 'The touch HUD in phone landscape (emulated 844 by 390): vitals top left, buttons on the right, the left half of the screen is the move stick and the right half aims and fires.', callouts: [['#vitals', 'Health and armour'], ['#mapbtn', 'Map'], ['#pause', 'Pause'], ['#nade', 'Grenade'], ['#ability', 'Ability'], ['#reload', 'Reload'], ['#weapon', 'Weapon and ammo']] });
  await b.close();
}

fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1) + '\n');
console.log('manifest', Object.keys(manifest).length, 'shots');
process.exit(0);
