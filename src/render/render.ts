// Drawing only. Reads sim state and never writes it.
// Layers: DIM map (cool slate, always, so the level is never pitch black) -> fog over unexplored tiles -> LIT map
// through ONE light mesh over the visibility polygon (per-vertex falloff, lightmesh.ts) -> pickups, barriers, marks ->
// actors (hostiles only when the sim says the player can see them) -> overhead bars -> effects -> ?debug overlay
// -> screen-space UI.
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { TUNING } from '../config/tuning';
import { placeLabel, stackLabels, type Rect } from './labels';
import { createCamera, frameAxis, stepCamera, viewScale } from './camera';
import { WALL, walkable, type Level } from '../sim/level';
import { pointInPolygon } from '../sim/geom';
import { visibilityPolygon } from '../sim/vision';
import { createLightMesh, type LightMesh, type LightParams } from './lightmesh';
import { player, revealed, wants, type Actor, type World } from '../sim/world';
import type { Brain } from '../sim/bots';
import { touchStick, AIM_DEADZONE, type Input } from '../input/input';
import { bakeMap, type Baked } from './bake';
import { chogParts, place, type ChogParts, type Oval } from '../ui/chogShape';
import { px, type BrandToken } from '../config/brand';
import { outsideCircle, zoneAt, type Circle } from '../sim/zone';
import { matchSeconds } from '../sim/world';
import { clampMarker, edgeAnchor, enemyDrawMode } from './visibility';

const P = TUNING.palette;
const R = TUNING.render;
const DEG = Math.PI / 180;
// Dark keyline around every body: separates it from any floor value.
const KEYLINE = px('bgDeep');

// Operator art (src/ui/chogShape.ts), cached per hero. Every placed polygon gets its own array: Pixi keeps a
// reference to the points until it renders, so a shared scratch array would draw the last shape in every slot.
const PARTS = new Map<string, ChogParts>();
const partsOf = (id: string) => { let p = PARTS.get(id); if (!p) { p = chogParts(id); PARTS.set(id, p); } return p; };
function ovalPts(o: Oval, n = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(o.x + Math.cos(a) * o.rx, o.y + Math.sin(a) * o.ry); }
  return out;
}
const OVALS = new Map<Oval, number[]>();
const ovalOf = (o: Oval) => { let v = OVALS.get(o); if (!v) { v = ovalPts(o); OVALS.set(o, v); } return v; };
/** A unit-space dot on an operator, placed in the world. */
function dotAt(a: { x: number; y: number; facing: number }, d: { x: number; y: number }, r: number) {
  const c = Math.cos(a.facing), s = Math.sin(a.facing);
  return { x: a.x + (d.x * c - d.y * s) * r, y: a.y + (d.x * s + d.y * c) * r };
}

// Pixi keeps a reference to a points array, so each circle needs its own (32 sides; Pixi's own looks octagonal at u scale).
function circle(g: Graphics, x: number, y: number, r: number, n = 24): Graphics {
  const pts = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts[i * 2] = x + Math.cos(a) * r;
    pts[i * 2 + 1] = y + Math.sin(a) * r;
  }
  return g.poly(pts, true);
}

function arc(g: Graphics, x: number, y: number, r: number, a0: number, a1: number, n = 16): Graphics {
  g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return g;
}

export interface Marker {
  x: number;
  y: number;
  age: number;
  life: number;
  big: boolean;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  hostile: boolean;
}

export interface Fx {
  markers: Marker[];
  impacts: { x: number; y: number; age: number; blocked?: boolean }[];
  /** Cover pieces that just stopped a bullet: outline flash (COVER_FLASH_SECONDS). */
  coverFlashes: { box: { x0: number; y0: number; x1: number; y1: number }; age: number }[];
  hitMarks: { x: number; y: number; age: number; kill: boolean }[];
  shake: number;
  corpses: { x: number; y: number; hostile: boolean }[];
  // Fixed pool; `age >= 1` means free. Capped at TUNING.render.maxSparks.
  sparks: Spark[];
  damageArcs: { ang: number; age: number }[];
  pings: { x: number; y: number; age: number; hostile: boolean }[];
  // Seconds left that each actor id stays drawn after shooting at the player (see visibility.ts).
  threats: number[];
  /** Pickups the player just took: a ring in the pickup's colour expands from the player (RC-7). */
  collects: { x: number; y: number; age: number; color: number }[];
}

/** How long the pickup ring lasts (s). */
export const COLLECT_SECONDS = 0.5;

export function createFx(): Fx {
  return {
    markers: [], impacts: [], coverFlashes: [], hitMarks: [], shake: 0, corpses: [], damageArcs: [], pings: [], threats: [], collects: [],
    sparks: Array.from({ length: R.maxSparks }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, hostile: false })),
  };
}

export interface DrawOpts {
  recap: boolean;
  marking: number | null;
  showSticks: boolean;
  playing: boolean;
  /** ?debug perception overlay. */
  debug?: boolean;
  /** HUD panel rects in screen (CSS) px; pickup labels avoid them (CHOG-HUD-002). */
  hud?: readonly Rect[];
}

export interface Renderer {
  app: Application;
  toScreen(x: number, y: number): { x: number; y: number };
  draw(w: World, fx: Fx, input: Input, dt: number, opts: DrawOpts): void;
  /** The visibility polygon computed this frame (shared, do not mutate). */
  visPoly(): readonly number[];
  reset(w: World): void;
  visibleBots(): number;
  /** Hostiles drawn this frame only because they just shot at the player. */
  flashBots(): number;
  /** Seen hostiles past the screen edge this frame (each gets an edge chevron). */
  offscreenMarks(): number;
}

export const COVER_FLASH_SECONDS = 0.18;
// Portrait camera: the same smoothing with a longer lead toward the aim (TUNING.render.portraitLookahead).
const PORTRAIT_CAM = { ...TUNING.render, lookahead: TUNING.render.portraitLookahead };
// The player's drawn radius plus its overhead bar, in u: how far from a HUD band the portrait camera keeps it.
const PLAYER_MARGIN = 1;

export async function createRenderer(parent: HTMLElement): Promise<Renderer> {
  const app = new Application();
  await app.init({
    background: 0x0b0c0d,
    resizeTo: parent,
    antialias: true,
    autoDensity: true,
    // DPR cap 1.5: fill cost scales with pixels (P3 audit: dpr2 roughly halved fps vs dpr1).
    resolution: Math.min(window.devicePixelRatio || 1, R.maxResolution),
    // The light mesh ships a GLSL program only.
    preference: 'webgl',
  });
  parent.appendChild(app.canvas);

  const world = new Container();
  const dimSprite = new Sprite();
  const fogG = new Graphics();
  // One-pass light (lightmesh.ts): created on the first bake, lives in this layer.
  const lightLayer = new Container();
  let light: LightMesh | null = null;
  const props = new Graphics();
  // Danger zone (RC-8): over the floor and cover, under bodies, so operators stay readable inside the red.
  const zoneG = new Graphics();
  const labels = new Container();
  const marks = new Graphics();
  const actors = new Graphics();
  const bars = new Graphics();
  const fxG = new Graphics();
  const recapG = new Graphics();
  const debugG = new Graphics();
  const debugLabels = new Container();
  const screen = new Graphics();
  world.addChild(dimSprite, fogG, lightLayer, props, zoneG, labels, marks, actors, bars, fxG, recapG, debugG, debugLabels);
  app.stage.addChild(world, screen);

  let level: Level;
  let baked: Baked | null = null;
  let bakedKey = '';
  let explored: Uint8Array;
  let exploredDirty = true;
  let camX = 0, camY = 0, ppu = 40;
  const shownHostiles: Actor[] = [];
  let offscreenMarks = 0;
  let cam = createCamera(0, 0);
  const poly: number[] = [];
  const lightParams: LightParams = { x: 0, y: 0, facing: 0, range: 1, coneRad: 1, nearRadius: TUNING.vision.nearRadius, edgeRad: TUNING.vision.softEdgeDeg * DEG };
  const debugTexts: Text[] = [];
  let visBots = 0, flashBots = 0;
  let exploreTimer = 0;
  const pickupLabels: Text[] = [];

  function drawFog() {
    fogG.clear();
    const { w, h } = level;
    for (let y = 0; y < h; y++) {
      let run = -1;
      for (let x = 0; x <= w; x++) {
        const un = x < w && !explored[y * w + x];
        if (un && run < 0) run = x;
        if (!un && run >= 0) {
          fogG.rect(run, y, x - run, 1);
          run = -1;
        }
      }
    }
    fogG.fill({ color: P.fogUnexplored, alpha: 0.72 });
  }

  function updateExplored(p: Actor) {
    const r = Math.ceil(p.view.range) + 1;
    const { w, h, tiles } = level;
    for (let y = Math.max(0, Math.floor(p.y) - r); y < Math.min(h, Math.floor(p.y) + r + 1); y++) {
      for (let x = Math.max(0, Math.floor(p.x) - r); x < Math.min(w, Math.floor(p.x) + r + 1); x++) {
        const i = y * w + x;
        if (explored[i]) continue;
        let seen = false;
        if (tiles[i] === WALL) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const tx = x + dx, ty = y + dy;
            if (tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty * w + tx] !== WALL && pointInPolygon(tx + 0.5, ty + 0.5, poly)) seen = true;
          }
        } else seen = pointInPolygon(x + 0.5, y + 0.5, poly);
        if (seen) {
          explored[i] = 1;
          exploredDirty = true;
        }
      }
    }
  }

  function drawWeapon(g: Graphics, a: Actor, col: number, dark: number) {
    const W = a.weapon;
    const r = TUNING.movement.radius * R.actorScale;
    // Reload: the gun dips 35 deg. Recoil: it kicks back for the muzzle-flash time.
    const ang = a.facing + (a.reloadLeft > 0 ? -35 * DEG : 0);
    const kick = (a.muzzle / R.muzzleFlash) * (W.pellets > 1 ? 0.16 : W.id === 'marksman' ? 0.14 : 0.07);
    const c = Math.cos(ang), s = Math.sin(ang);
    const x0 = a.x + c * (r * 0.3 - kick), y0 = a.y + s * (r * 0.3 - kick);
    const len = r + W.barrel * 0.85 - kick;
    const thick = (W.id === 'shotgun' ? 0.16 : W.id === 'marksman' ? 0.09 : W.id === 'smg' ? 0.13 : 0.12) * 1.15;
    g.moveTo(x0, y0).lineTo(a.x + c * len, a.y + s * len).stroke({ width: thick + 0.07, color: dark });
    g.moveTo(x0, y0).lineTo(a.x + c * len, a.y + s * len).stroke({ width: thick, color: col });
    if (W.id === 'marksman') circle(g, a.x + c * (r + 0.25), a.y + s * (r + 0.25), 0.07, 10).fill(dark);
    if (W.id === 'smg') g.moveTo(a.x + c * (r + 0.1), a.y + s * (r + 0.1)).lineTo(a.x + c * (r + 0.1) - s * 0.18, a.y + s * (r + 0.1) + c * 0.18).stroke({ width: 0.07, color: dark });
  }

  function drawBody(g: Graphics, a: Actor, hostile: boolean, marking: number | null, alert: boolean) {
    // RC-8: the CHOG-inspired operator (src/ui/chogShape.ts) at its true sim size: valleys and spike tips straddle the
    // 0.35 u hitbox, so a bullet that touches the drawn body hits and one that misses it misses.
    const r0 = TUNING.movement.radius * R.actorScale;
    let alpha = 1, r = r0;
    if (!a.alive) {
      const t = Math.min(1, a.deadFor / R.deathAnimSeconds);
      alpha = 1 - t * 0.55;
      r = r0 * (1 - t * 0.25);
    }
    // Walk bob: a small breathing pulse tied to the step cycle.
    const speed = Math.hypot(a.vx, a.vy);
    if (a.alive && speed > 0.3) r *= 1 + 0.05 * Math.sin((a.stepAcc / TUNING.movement.stepDistance) * Math.PI * 2);
    const parts = partsOf(a.hero.id);
    const col = (t: BrandToken) => px(t);
    // Soft drop shadow.
    g.ellipse(a.x + 0.06, a.y + 0.1, r0 * 1.1, r0 * 0.9).fill({ color: 0x000000, alpha: 0.35 * alpha });
    // Team cue under the body, by SHAPE as well as colour: allies get a round ring, hostiles a jagged outline that
    // follows the spikes (2 px class keyline), so the two never read alike even without colour.
    if (a.alive) {
      if (hostile) g.poly(place(parts.body, a.x, a.y, a.facing, r * 1.14)).stroke({ width: 0.1, color: P.hostile, alpha: 1 });
      else circle(g, a.x, a.y, r0 * 1.42, 28).stroke({ width: 0.06, color: P.teamRing, alpha: 0.95 });
    }
    if (a.alive) drawWeapon(g, a, hostile ? 0x2a1a14 : col('bgElevated'), KEYLINE);
    const flash = a.alive && a.hitFlash > 0;
    // Same purple body for every operator: friend or foe is told by the ring or jagged red outline and the bar colour.
    const body = !a.alive ? col('disabled') : flash ? col('cream') : col('purple');
    g.poly(place(parts.body, a.x, a.y, a.facing, r)).fill({ color: body, alpha }).stroke({ width: 0.045, color: KEYLINE, alpha });
    if (a.alive && !hostile) g.poly(place(parts.body, a.x, a.y, a.facing, r * 0.97)).stroke({ width: 0.02, color: col('purpleBright'), alpha: 0.9 });
    for (const gr of parts.gear) {
      if (gr.poly) g.poly(place(gr.poly, a.x, a.y, a.facing, r)).fill({ color: col(gr.fill), alpha }).stroke(gr.stroke ? { width: 0.025, color: col(gr.stroke), alpha } : { width: 0 });
    }
    // Face, eyes (they look where the gun points), cheeks, hands.
    g.poly(place(ovalOf(parts.face), a.x, a.y, a.facing, r)).fill({ color: hostile ? col('creamWarm') : col('cream'), alpha });
    for (const gr of parts.gear) {
      if (!gr.dot) continue;
      const d = dotAt(a, gr.dot, r);
      circle(g, d.x, d.y, gr.dot.r * r, 12).fill({ color: col(gr.fill), alpha });
      if (gr.stroke) circle(g, d.x, d.y, gr.dot.r * r, 12).stroke({ width: 0.02, color: col(gr.stroke), alpha });
    }
    if (a.alive) {
      for (const e of parts.eyes) {
        const d = dotAt(a, e, r);
        circle(g, d.x, d.y, e.r * r, 10).fill(KEYLINE);
        const gl = dotAt(a, { x: e.x + 0.04, y: e.y - 0.04 }, r);
        circle(g, gl.x, gl.y, e.r * r * 0.38, 6).fill(col('cream'));
      }
      for (const c of parts.cheeks) { const d = dotAt(a, c, r); circle(g, d.x, d.y, c.r * r, 8).fill({ color: hostile ? col('pinkSoft') : col('pink'), alpha: 0.85 }); }
      for (const h of parts.hands) { const d = dotAt(a, h, r); circle(g, d.x, d.y, h.r * r, 10).fill(col('pink')).stroke({ width: 0.02, color: KEYLINE }); }
    }
    // Demo NFT marking colour (DEMO layer): a small badge on the back.
    if (marking !== null && a.alive) { const d = dotAt(a, { x: -0.72, y: 0.36 }, r); circle(g, d.x, d.y, 0.06, 10).fill(marking).stroke({ width: 0.015, color: KEYLINE }); }
    if (hostile && alert && a.alive) {
      // Telegraph: it has seen something and is about to commit.
      g.poly([a.x - 0.13, a.y - r - 0.75, a.x + 0.13, a.y - r - 0.75, a.x, a.y - r - 0.42]).fill(P.signal);
    }
    const cos = Math.cos(a.facing), sin = Math.sin(a.facing);
    if (!a.alive && a.deadFor > R.deathAnimSeconds * 0.5) {
      g.moveTo(a.x - 0.2, a.y - 0.2).lineTo(a.x + 0.2, a.y + 0.2).moveTo(a.x + 0.2, a.y - 0.2).lineTo(a.x - 0.2, a.y + 0.2)
        .stroke({ width: 0.07, color: KEYLINE, alpha: 0.8 });
    }
    if (a.alive && a.reloadLeft > 0) {
      const t = 1 - a.reloadLeft / a.weapon.reloadSeconds;
      arc(g, a.x, a.y, r0 * 1.7, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2, 20).stroke({ width: 0.05, color: P.signal, alpha: 0.85 });
    }
    if (a.alive && a.muzzle > 0) {
      const W = a.weapon;
      const L = r0 + W.barrel + 0.05;
      const mx = a.x + cos * L, my = a.y + sin * L;
      if (W.pellets > 1) g.poly([mx, my, mx + Math.cos(a.facing - 0.35) * 0.5, my + Math.sin(a.facing - 0.35) * 0.5, mx + Math.cos(a.facing + 0.35) * 0.5, my + Math.sin(a.facing + 0.35) * 0.5]).fill({ color: P.signal, alpha: 0.9 });
      else {
        const z = W.id === 'marksman' ? 0.6 : W.id === 'smg' ? 0.25 : 0.35;
        g.poly([mx + cos * z, my + sin * z, mx - sin * 0.1, my + cos * 0.1, mx + sin * 0.1, my - cos * 0.1]).fill(P.signal);
      }
    }
  }

  // Compact overhead bar for a visible actor: 34x4 px HP, 34x2 px armour (at ppu ~35).
  function drawBar(a: Actor, hostile: boolean) {
    const W = 0.96, H = 0.11, x = a.x - W / 2, y = a.y - TUNING.movement.radius * R.actorScale - 0.42;
    bars.rect(x - 0.03, y - 0.03, W + 0.06, H + 0.1).fill({ color: KEYLINE, alpha: 0.75 });
    bars.rect(x, y, W * Math.min(1, Math.max(0, a.hp / a.maxHp)), H).fill(hostile ? P.hostile : P.team);
    if (a.maxArmor > 0 && a.armor > 0) bars.rect(x, y + H + 0.015, W * Math.min(1, a.armor / a.maxArmor), 0.05).fill(P.armor);
  }

  // ?debug: what each bot believes and why (docs/design/bots.md). Text objects pooled.
  function drawDebug(w: World) {
    debugG.clear();
    let i = 0;
    const placed: { x: number; y: number }[] = [];
    for (const a of w.actors) {
      if (a.team !== 'bot' || !a.alive) continue;
      const br = w.brains.get(a.id) as Brain;
      const token = w.attackTokens.includes(a.id);
      const col = br.source === 'seen' ? 0xff4d5e : br.source === 'flash' ? 0xffc94a : br.source === 'heard' ? 0x5aa9ff : br.source === 'shot' ? 0xff8a3d : br.source === 'sonar' ? 0x5ce07a : 0x9aa4ad;
      if (br.lastKnown) debugG.moveTo(a.x, a.y).lineTo(br.lastKnown.x, br.lastKnown.y).stroke({ width: 0.05, color: col, alpha: 0.85 });
      if (br.lastKnown) circle(debugG, br.lastKnown.x, br.lastKnown.y, 0.22).stroke({ width: 0.05, color: col });
      circle(debugG, a.x, a.y, 0.95).stroke({ width: token ? 0.12 : 0.04, color: token ? 0xffd34d : 0x9aa4ad, alpha: token ? 1 : 0.5 });
      const view = a.view;
      debugG.moveTo(a.x, a.y).lineTo(a.x + Math.cos(a.facing - view.coneRad / 2) * 2, a.y + Math.sin(a.facing - view.coneRad / 2) * 2)
        .moveTo(a.x, a.y).lineTo(a.x + Math.cos(a.facing + view.coneRad / 2) * 2, a.y + Math.sin(a.facing + view.coneRad / 2) * 2)
        .stroke({ width: 0.03, color: 0xffffff, alpha: 0.35 });
      let t = debugTexts[i];
      if (!t) {
        t = new Text({ text: '', style: { fontFamily: 'Plex Mono, monospace', fontSize: 20, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        t.scale.set(1 / 80);
        t.anchor.set(0.5, 1);
        debugLabels.addChild(t);
        debugTexts.push(t);
      }
      t.visible = true;
      t.text = `${a.name} ${br.state}${token ? ' [T]' : ''}\n${br.source ?? '-'} s${Math.round(br.suspicion * 100)}`;
      t.position.set(a.x, a.y - 1.05);
      placed.push({ x: a.x, y: a.y - 1.05 });
      i++;
    }
    // Bots standing together: stack their labels instead of overprinting (2 lines ~0.6 u tall, ~2.4 u wide).
    const ys = stackLabels(placed, 2.4, 0.62);
    for (let k = 0; k < placed.length; k++) debugTexts[k].position.y = ys[k];
    for (; i < debugTexts.length; i++) debugTexts[i].visible = false;
  }

  function drawPickups(w: World, hud: readonly Rect[]) {
    props.clear();
    const me = player(w);
    w.pickups.forEach((p, i) => {
      const lbl = pickupLabels[i];
      const known = explored[Math.floor(p.y) * level.w + Math.floor(p.x)];
      lbl.visible = !!known;
      if (!known) return;
      // Keep the label out from under HUD panels: below by default, above if blocked, hidden if both are.
      const sx = world.position.x + p.x * ppu, sy = world.position.y + p.y * ppu;
      const pl = placeLabel(sx, sy, lbl.width * ppu, lbl.height * ppu, 0.38 * ppu, hud);
      lbl.visible = pl.visible;
      lbl.position.set(p.x, p.y + (pl.y - sy) / ppu);
      const col = p.kind === 'health' ? P.heal : p.kind === 'armor' ? P.armor : P.ammo;
      if (!p.active) {
        circle(props, p.x, p.y, 0.32).stroke({ width: 0.04, color: col, alpha: 0.35 });
        const t = 1 - p.respawnLeft / TUNING.pickups[p.kind].respawn;
        arc(props, p.x, p.y, 0.32, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2).stroke({ width: 0.06, color: col, alpha: 0.6 });
        lbl.alpha = 0.4;
        return;
      }
      lbl.alpha = 1;
      const bob = Math.sin(w.tick / 20 + i) * 0.04;
      // RC-7: a pickup the player would actually take (wants(): not full) gets a slow pulsing ring, so "you need
      // this" reads at a glance. Full health/armour/ammo: no ring, the pickup just sits there.
      if (me.alive && wants(me, p.kind)) {
        const pulse = 0.5 + 0.5 * Math.sin(w.tick / 9);
        circle(props, p.x, p.y + bob, 0.5 + pulse * 0.06, 28).fill({ color: P.pickup, alpha: 0.12 + pulse * 0.1 }).stroke({ width: 0.05, color: P.pickup, alpha: 0.45 + pulse * 0.4 });
      }
      props.ellipse(p.x + 0.05, p.y + 0.12, 0.34, 0.24).fill({ color: 0x000000, alpha: 0.35 });
      props.roundRect(p.x - 0.3, p.y - 0.3 + bob, 0.6, 0.6, 0.1).fill(px('bgPanel')).stroke({ width: 0.05, color: col });
      if (p.kind === 'health') props.rect(p.x - 0.18, p.y - 0.06 + bob, 0.36, 0.12).rect(p.x - 0.06, p.y - 0.18 + bob, 0.12, 0.36).fill(col);
      else if (p.kind === 'armor') props.poly([p.x - 0.17, p.y - 0.17 + bob, p.x + 0.17, p.y - 0.17 + bob, p.x + 0.17, p.y + 0.02 + bob, p.x, p.y + 0.2 + bob, p.x - 0.17, p.y + 0.02 + bob]).fill(col);
      else for (let k = 0; k < 3; k++) props.rect(p.x - 0.17 + k * 0.13, p.y - 0.16 + bob, 0.08, 0.32).fill(col);
    });
    // Deployed slabs.
    for (const b of w.barriers) {
      const bx = b.box;
      props.rect(bx.x0 + 0.08, bx.y0 + 0.12, bx.x1 - bx.x0, bx.y1 - bx.y0).fill({ color: 0x000000, alpha: 0.3 });
      props.rect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0).fill(0x7d8a8e).stroke({ width: 0.05, color: 0x2e3436 });
      const t = b.left / TUNING.abilities.barrierSeconds;
      props.rect(bx.x0, bx.y0, (bx.x1 - bx.x0) * t, 0.05).fill({ color: P.signal, alpha: 0.8 });
    }
  }

  // Dashed circle (the next safe circle during a warning): reads as "coming", not as a wall.
  function dashed(g: Graphics, c: Circle, dashes: number) {
    for (let i = 0; i < dashes; i++) {
      const a0 = (i / dashes) * Math.PI * 2;
      arc(g, c.x, c.y, c.r, a0, a0 + (Math.PI / dashes) * 1.1, 6);
    }
    return g;
  }

  /** Brand guide: zone fill #FF2D2D, edge glow #FF6B6B, a 1 px purple inner stroke. Fill at 22% instead of the guide's
   * 60%: at 60% the floor, cover and bodies under it stop reading (token kept, treatment changed, docs/BRAND.md). */
  function drawZone(w: World) {
    zoneG.clear();
    if (!w.zone) return;
    const v = zoneAt(w.zone, matchSeconds(w));
    const c = v.circle;
    const m = 30;
    zoneG.rect(-m, -m, level.w + m * 2, level.h + m * 2).fill({ color: P.zone, alpha: v.dps > 0 ? 0.22 : 0.12 });
    circle(zoneG, c.x, c.y, c.r, 96).cut();
    circle(zoneG, c.x, c.y, c.r + 0.12, 96).stroke({ width: 0.34, color: P.zoneGlow, alpha: 0.28 });
    circle(zoneG, c.x, c.y, c.r, 96).stroke({ width: 0.1, color: P.zoneGlow, alpha: 0.95 });
    circle(zoneG, c.x, c.y, c.r - 0.07, 96).stroke({ width: 0.03, color: px('purple'), alpha: 0.9 });
    if (v.next) dashed(zoneG, v.next, 36).stroke({ width: 0.07, color: P.signal, alpha: 0.85 });
  }

  const r: Renderer = {
    app,
    toScreen(x, y) {
      return { x: (x - camX) * ppu + app.screen.width / 2, y: (y - camY) * ppu + app.screen.height / 2 };
    },
    reset(w) {
      // Bake once per distinct map (every restart builds a new Level object for the same tiles).
      const key = `${w.level.w}x${w.level.h}:${w.level.tiles.join('')}`;
      if (!baked || key !== bakedKey) {
        const old = baked;
        baked = bakeMap(app.renderer, w.level);
        bakedKey = key;
        // Free the old textures only after the next frame has stopped using them.
        if (old) setTimeout(() => { old.lit.destroy(true); old.dim.destroy(true); }, 200);
        dimSprite.texture = baked.dim;
        dimSprite.scale.set(1 / baked.ppu);
        if (!light) {
          light = createLightMesh(baked.lit, w.level.w, w.level.h, [1, 0.95, 0.86]);
          lightLayer.addChild(light.mesh);
        } else light.setTexture(baked.lit, w.level.w, w.level.h);
      }
      level = w.level;
      explored = new Uint8Array(level.w * level.h);
      exploredDirty = true;
      const p = player(w);
      cam = createCamera(p.x, p.y);
      camX = p.x;
      camY = p.y;
      // Labels are reused across restarts (destroying a bound Text texture warns in Pixi).
      w.pickups.forEach((pk, i) => {
        let t = pickupLabels[i];
        if (!t) {
          t = new Text({ text: '', style: { fontFamily: 'Plex Mono, monospace', fontSize: 22, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
          t.anchor.set(0.5, 0);
          t.scale.set(1 / 80);
          labels.addChild(t);
          pickupLabels.push(t);
        }
        t.text = pk.kind === 'health' ? 'HEALTH' : pk.kind === 'armor' ? 'ARMOUR' : 'AMMO';
        t.tint = pk.kind === 'health' ? P.heal : pk.kind === 'armor' ? P.armor : P.ammo;
        t.position.set(pk.x, pk.y + 0.38);
      });
      for (let i = w.pickups.length; i < pickupLabels.length; i++) pickupLabels[i].visible = false;
    },
    visibleBots: () => visBots,
    visPoly: () => poly,
    flashBots: () => flashBots,
    offscreenMarks: () => offscreenMarks,
    draw(w, fx, input, dt, opts) {
      const p = player(w);
      const sw = app.screen.width, sh = app.screen.height;
      const portrait = sh > sw;
      ppu = viewScale(sw, sh, R);
      stepCamera(cam, p.x, p.y, p.facing, dt, portrait ? PORTRAIT_CAM : R);
      camX = cam.x;
      camY = cam.y;
      if (portrait) {
        // HUD bands (px -> u): panels hugging the top/bottom edge, and side panels between them (Ability, Reload).
        let top = 0, bottom = 0, left = 0, right = 0;
        for (const h of opts.hud ?? []) {
          if (h.y + h.h < sh * 0.3) top = Math.max(top, h.y + h.h);
          else if (h.y > sh * 0.7) bottom = Math.max(bottom, sh - h.y);
          else if (h.x > sw * 0.5) right = Math.max(right, sw - h.x);
          else left = Math.max(left, h.x + h.w);
        }
        camX = frameAxis(cam.x, p.x, sw / ppu, level.w, left / ppu, right / ppu, PLAYER_MARGIN);
        camY = frameAxis(cam.y, p.y, sh / ppu, level.h, top / ppu, bottom / ppu, PLAYER_MARGIN);
      }
      let sx = 0, sy = 0;
      if (fx.shake > 0) {
        const s = (R.shakePx * fx.shake) / R.shakeSeconds;
        sx = (Math.random() * 2 - 1) * s;
        sy = (Math.random() * 2 - 1) * s;
      }
      world.scale.set(ppu);
      world.position.set(sw / 2 - camX * ppu + sx, sh / 2 - camY * ppu + sy);

      // Light: ONE visibility polygon per frame (also used for explore, bullets and fx), drawn as one mesh.
      const view = p.view;
      visibilityPolygon(level, p.x, p.y, p.facing, view, TUNING.vision.rayStepDeg * DEG, poly);
      lightParams.x = p.x; lightParams.y = p.y; lightParams.facing = p.facing;
      lightParams.range = view.range; lightParams.coneRad = view.coneRad; lightParams.nearRadius = view.nearRadius;
      light?.update(poly, lightParams);
      exploreTimer -= dt;
      if (exploreTimer <= 0) {
        exploreTimer = 0.1;
        updateExplored(p);
        if (exploredDirty) {
          exploredDirty = false;
          drawFog();
        }
      }
      drawPickups(w, opts.hud ?? []);
      drawZone(w);

      // Heard markers: rings, never a body. Corpses stay as decals.
      marks.clear();
      for (const m of fx.markers) {
        const t = m.age / m.life;
        const rad = (m.big ? 0.9 : 0.45) + t * (m.big ? 1.2 : 0.6);
        circle(marks, m.x, m.y, rad).stroke({ width: 0.06, color: P.signal, alpha: 0.75 * (1 - t) });
      }
      for (const c of fx.corpses) {
        marks.ellipse(c.x, c.y, 0.42, 0.3).fill({ color: c.hostile ? P.hostileDark : P.teamDark, alpha: 0.55 });
      }

      actors.clear();
      bars.clear();
      visBots = 0;
      flashBots = 0;
      shownHostiles.length = 0;
      const rev = revealed(w, p);
      for (const a of w.actors) {
        // Teammates (online) are allies: always drawn, round green ring. Anyone on another team is a hostile.
        if (a !== p && a.team === p.team) {
          if (!a.alive && a.deadFor > R.deathAnimSeconds) continue;
          drawBody(actors, a, false, null, false);
          if (a.alive) drawBar(a, false);
          continue;
        }
        if (a !== p) {
          if (!a.alive && a.deadFor > R.deathAnimSeconds) continue;
          const mode = enemyDrawMode(level, p, view, a, {
            recapKiller: !!opts.recap && w.playerKill?.killerId === a.id,
            threatLeft: fx.threats[a.id] ?? 0,
            pinged: rev.includes(a),
          });
          if (mode === null) continue;
          if (a.alive) shownHostiles.push(a);
          if (mode === 'ping') {
            // Ping reveal: an outline only, so it reads as information, not presence.
            const pulse = 0.5 + 0.5 * Math.sin(w.tick / 4);
            circle(actors, a.x, a.y, 0.42).stroke({ width: 0.07, color: P.hostile, alpha: 0.5 + pulse * 0.4 });
            actors.moveTo(a.x, a.y).lineTo(a.x + Math.cos(a.facing) * 0.7, a.y + Math.sin(a.facing) * 0.7).stroke({ width: 0.06, color: P.hostile, alpha: 0.7 });
            continue;
          }
          if (mode === 'flash') {
            // Shot at us from outside the light: show the shooter where it really stands, ringed so it reads.
            flashBots++;
            circle(actors, a.x, a.y, 0.62).stroke({ width: 0.08, color: P.hostile, alpha: 0.9 });
          }
          if (a.alive) visBots++;
          const br = w.brains.get(a.id) as Brain | undefined;
          drawBody(actors, a, true, null, br?.state === 'alert');
          if (a.alive) drawBar(a, true);
        }
      }
      drawBody(actors, p, false, opts.marking, false);
      if (p.alive) drawBar(p, false);
      if (opts.debug) drawDebug(w);
      else if (debugG.children.length || debugTexts.length) { debugG.clear(); for (const t of debugTexts) t.visible = false; }
      if (opts.showSticks && input.right.active && p.alive) {
        const sp = p.lastSpread * DEG, L = Math.min(p.weapon.falloffEnd, 6);
        actors.moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing - sp) * L, p.y + Math.sin(p.facing - sp) * L)
          .moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing + sp) * L, p.y + Math.sin(p.facing + sp) * L)
          .stroke({ width: 0.03, color: P.team, alpha: 0.35 });
      }

      // Effects inside the light only.
      fxG.clear();
      for (const b of w.bullets) {
        if (!pointInPolygon(b.x, b.y, poly)) continue;
        const travelled = Math.hypot(b.x - b.ox, b.y - b.oy);
        const len = Math.min(b.weapon.id === 'marksman' ? 2.2 : b.weapon.pellets > 1 ? 0.5 : 0.9, travelled);
        fxG.moveTo(b.x - b.dx * len, b.y - b.dy * len).lineTo(b.x, b.y)
          .stroke({ width: b.weapon.tracer, color: w.actors[b.owner]?.team !== p.team ? P.hostileTracer : P.signal });
      }
      for (const s of fx.sparks) {
        if (s.age >= 1 || !pointInPolygon(s.x, s.y, poly)) continue;
        fxG.moveTo(s.x, s.y).lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03).stroke({ width: 0.04, color: s.hostile ? P.hostile : P.signal, alpha: 1 - s.age });
      }
      for (const cf of fx.coverFlashes) {
        const b = cf.box, al = Math.max(0, 1 - cf.age / COVER_FLASH_SECONDS);
        fxG.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).stroke({ width: 0.07, color: 0xe8f1ff, alpha: 0.85 * al });
      }
      for (const im of fx.impacts) {
        if (!pointInPolygon(im.x, im.y, poly)) continue;
        circle(fxG, im.x, im.y, 0.06 + im.age * 0.8, 10).fill({ color: 0x1a1612, alpha: 0.6 * (1 - im.age * 4) });
        // 'Blocked' by half cover: a bright chevron burst, distinct from a wall puff.
        if (im.blocked) circle(fxG, im.x, im.y, 0.12 + im.age * 1.4, 8).stroke({ width: 0.06, color: 0xe8f1ff, alpha: Math.max(0, 0.9 - im.age * 3.5) });
      }
      for (const h of fx.hitMarks) {
        const s = 0.24, al = 1 - h.age / 0.2;
        fxG.moveTo(h.x - s, h.y - s).lineTo(h.x + s, h.y + s).moveTo(h.x + s, h.y - s).lineTo(h.x - s, h.y + s)
          .stroke({ width: h.kill ? 0.12 : 0.07, color: h.kill ? P.hostile : 0xffffff, alpha: al });
      }
      for (const pg of fx.pings) {
        const t = pg.age / 0.7;
        circle(fxG, pg.x, pg.y, 0.5 + t * TUNING.abilities.sonarRadius, 48).stroke({ width: 0.08, color: pg.hostile ? P.hostile : P.armor, alpha: 0.7 * (1 - t) });
      }
      for (const c of fx.collects) {
        const t = c.age / COLLECT_SECONDS;
        circle(fxG, c.x, c.y, 0.45 + t * 0.9, 32).stroke({ width: 0.1 * (1 - t) + 0.02, color: c.color, alpha: 0.9 * (1 - t) });
      }

      recapG.clear();
      if (opts.recap && w.playerKill?.cause === 'zone') {
        // Taken by the danger zone: a red ring where the player fell, nothing pointing at a shooter.
        circle(recapG, w.playerKill.toX, w.playerKill.toY, 0.7).stroke({ width: 0.08, color: P.hostile });
      } else if (opts.recap && w.playerKill) {
        const kk = w.playerKill;
        const killer = w.actors[kk.killerId];
        const from = clampMarker(level, kk.fromX, kk.fromY, killer.x, killer.y, walkable);
        recapG.moveTo(from.x, from.y).lineTo(kk.toX, kk.toY).stroke({ width: 0.07, color: P.hostile, alpha: 0.9 });
        circle(recapG, from.x, from.y, 0.6).stroke({ width: 0.07, color: P.hostile });
      }

      // Screen space.
      screen.clear();
      const ps = r.toScreen(p.x, p.y);
      if (input.mode === 'pc' && p.alive && opts.playing) {
        const d = Math.hypot(input.mouseX - ps.x, input.mouseY - ps.y);
        const gap = Math.max(4, Math.tan(p.lastSpread * DEG) * d);
        const mx = input.mouseX, my = input.mouseY;
        screen.moveTo(mx - gap - 7, my).lineTo(mx - gap, my).moveTo(mx + gap, my).lineTo(mx + gap + 7, my)
          .moveTo(mx, my - gap - 7).lineTo(mx, my - gap).moveTo(mx, my + gap).lineTo(mx, my + gap + 7)
          .stroke({ width: 2, color: P.team, alpha: 0.9 });
        screen.circle(mx, my, 1.2).fill(P.team);
      }
      // Damage direction: a red arc around the player toward where the shot came from.
      for (const da of fx.damageArcs) {
        const al = 1 - da.age / R.damageArcSeconds;
        arc(screen, ps.x, ps.y, ppu * 1.4, da.ang - 0.38, da.ang + 0.38, 12).stroke({ width: 6, color: P.hostile, alpha: 0.9 * al });
      }
      // Outside the danger zone: a red chevron next to you pointing the shortest way back in.
      if (w.zone && p.alive && opts.playing) {
        const zc = zoneAt(w.zone, matchSeconds(w)).circle;
        if (outsideCircle(zc, p.x, p.y)) {
          const ang = Math.atan2(zc.y - p.y, zc.x - p.x), c = Math.cos(ang), sn = Math.sin(ang);
          const ex = ps.x + c * ppu * 1.15, ey = ps.y + sn * ppu * 1.15, z = 12;
          screen.poly([ex + c * z, ey + sn * z, ex - sn * z * 0.75, ey + c * z * 0.75, ex + sn * z * 0.75, ey - c * z * 0.75])
            .fill({ color: P.zoneGlow, alpha: 0.95 }).stroke({ width: 2, color: KEYLINE });
        }
      }
      if (opts.showSticks) {
        for (const s of [input.left, input.right]) {
          if (!s.active) continue;
          screen.circle(s.baseX, s.baseY, touchStick.radius).stroke({ width: 2, color: P.team, alpha: 0.25 });
          if (s === input.right) screen.circle(s.baseX, s.baseY, touchStick.radius * AIM_DEADZONE).stroke({ width: 1.5, color: P.signal, alpha: 0.4 });
          screen.circle(s.x, s.y, 18).fill({ color: P.team, alpha: 0.35 });
        }
      }
      // A hostile you can see (cone, muzzle flash, Ping) but which sits past the screen edge: a red edge chevron on
      // the line from you to it. Only what you already see, never more (RC-5: the portrait view is ~15 u wide while
      // Wick sees 12 u and the Lamp sidegrade 14.6 u).
      offscreenMarks = 0;
      for (const a of shownHostiles) {
        const s = r.toScreen(a.x, a.y);
        const e = edgeAnchor(ps.x, ps.y, s.x, s.y, 16, 16, sw - 16, sh - 16);
        if (!e) continue;
        offscreenMarks++;
        const c = Math.cos(e.ang), sn = Math.sin(e.ang), z = 14;
        screen.poly([e.x + c * z, e.y + sn * z, e.x - sn * z * 0.7, e.y + c * z * 0.7, e.x + sn * z * 0.7, e.y - c * z * 0.7])
          .fill({ color: P.hostile, alpha: 0.95 }).stroke({ width: 1.5, color: 0x15140f, alpha: 0.8 });
      }
      const margin = 22;
      for (const m of fx.markers) {
        const s = r.toScreen(m.x, m.y);
        if (s.x > 0 && s.x < sw && s.y > 0 && s.y < sh) continue;
        const ang = Math.atan2(s.y - sh / 2, s.x - sw / 2);
        const ex = Math.max(margin, Math.min(sw - margin, sw / 2 + Math.cos(ang) * sw));
        const ey = Math.max(margin, Math.min(sh - margin, sh / 2 + Math.sin(ang) * sh));
        const c = Math.cos(ang), sn = Math.sin(ang), z = m.big ? 13 : 9;
        screen.poly([ex + c * z, ey + sn * z, ex - sn * z * 0.6, ey + c * z * 0.6, ex + sn * z * 0.6, ey - c * z * 0.6])
          .fill({ color: P.signal, alpha: 0.85 * (1 - m.age / m.life) });
      }
    },
  };
  return r;
}
