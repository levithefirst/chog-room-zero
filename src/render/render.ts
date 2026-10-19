// Drawing only. Reads sim state and never writes it.
// Layers: DIM map (cool slate, always, so the level is never pitch black) -> fog over unexplored tiles -> LIT map
// through ONE light mesh over the visibility polygon (per-vertex falloff, lightmesh.ts) -> pickups, barriers, marks ->
// actors (hostiles only when the sim says the player can see them) -> overhead bars -> effects -> ?debug overlay
// -> screen-space UI.
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { TUNING } from '../config/tuning';
import { placeLabel, stackLabels, type Rect } from './labels';
import { PERKS } from '../config/perks';
import { createCamera, frameAxis, leadTarget, stepCamera, viewScale } from './camera';
import { WALL, walkable, type Level } from '../sim/level';
import { pointInPolygon } from '../sim/geom';
import { canSee, visibilityPolygon } from '../sim/vision';
import { createLightMesh, type LightMesh, type LightParams } from './lightmesh';
import { beamEnd, beamNear, lootTake, player, revealed, wants, type Actor, type World } from '../sim/world';
import type { Brain } from '../sim/bots';
import { touchStick, AIM_DEADZONE, type Input } from '../input/input';
import { bakeMap, type Baked } from './bake';
import { chogParts, place, type ChogParts, type Oval } from '../ui/chogShape';
import { px, type BrandToken } from '../config/brand';
import { ONE_OF_ONE } from '../config/power';
import { outsideCircle, zoneAt, type Circle } from '../sim/zone';
import { matchSeconds } from '../sim/world';
import { clampMarker, edgeAnchor, enemyDrawMode, teamSighting } from './visibility';
import { createIntel, type Intel } from '../sim/intel';
import { LAB } from '../config/lab';

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

/** What a heard sound was (CF-D): each kind has its own mark, so it reads with the sound off. */
export type { MarkKind } from '../sim/intel';
import type { MarkKind } from '../sim/intel';

export interface Marker {
  x: number;
  y: number;
  age: number;
  life: number;
  big: boolean;
  /** CF-D mark shape; absent = the plain ring (LAB.enemySound off). */
  kind?: MarkKind;
  /** Steps: the walker's heading, so the footprints point where it went. */
  ang?: number;
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
  /** `far`: metres to a shooter you could not see when it hit you (shown on the arc), else 0. */
  damageArcs: { ang: number; age: number; far: number }[];
  /** Sonar pings: r is the ability's real radius (Ping 14 m, Deadsight 18 m); color overrides for a 1:1. */
  pings: { x: number; y: number; age: number; hostile: boolean; r?: number; color?: number }[];
  // Seconds left that each actor id stays drawn after shooting at the player (see visibility.ts).
  threats: number[];
  /** Pickups the player just took: a ring in the pickup's colour expands from the player (RC-7). */
  collects: { x: number; y: number; age: number; color: number }[];
  /** 1:1 signature moments (burst, howl): a ring of the effect's real radius (RING_SECONDS). */
  rings: { x: number; y: number; age: number; r: number; color: number }[];
  /** CF-C your own noise: a ring that runs out to the radius it is really heard at, then is gone. */
  noise: { x: number; y: number; r: number; age: number }[];
  /** SB: what the player believes about each hostile (src/sim/intel.ts). The game feeds it, this draws it. */
  intel: Intel;
  /** SB: AI teammates' call-outs on screen: the line above the caller (TUNING.comms.chipSeconds). */
  comms: { from: number; text: string; age: number }[];
}

export const RING_SECONDS = 0.45;

/** How long the pickup ring lasts (s). */
export const COLLECT_SECONDS = 0.5;

export function createFx(): Fx {
  return {
    markers: [], impacts: [], coverFlashes: [], hitMarks: [], shake: 0, corpses: [], damageArcs: [], pings: [], threats: [], collects: [], rings: [], noise: [], intel: createIntel(), comms: [],
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
  /** CF hub backdrop: the live room behind the menus, zoomed in this much on the operator, camera fixed on it. */
  menu?: number;
  /** Online: hostile beams crossing you whose owner you are not shown (the server's stretch of line). Solo works it
   * out from the world with the same rule (beamNear). */
  beams?: readonly { k: 'laser' | 'xray'; x: number; y: number; a: number; len: number; c: number }[];
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
/** Each CHOG superpower's colour: its beam, glob, cage, goo or aura, and the pip by its owner's bar. */
export const POWER_COLOR: Record<string, number> = { laser: 0xff3b2f, xray: 0xb57bff, visor: 0x4fd6e8, bubble: 0xff7ac8, drool: 0x8bd450, aura: 0xffd166 };
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
  // V2: "shot from the dark" tags on damage arcs (distance to a shooter you could not see), pooled.
  const arcTags = new Container();
  const arcTagPool: Text[] = [];
  world.addChild(dimSprite, fogG, lightLayer, props, zoneG, labels, marks, actors, bars, fxG, recapG, debugG, debugLabels);
  app.stage.addChild(world, screen, arcTags);

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
  // GP loot bag labels, pooled.
  const lootLabels: Text[] = [];
  // SB call-out lines above AI teammates, pooled (one per caller on screen at a time).
  const commsTexts: Text[] = [];
  // Pickups as you last saw them (CF-E): out of your light you remember, you do not watch the respawn.
  // Where you last saw each pickup and whether it was there (pickups move when they come back: a remembered one stays
  // where you saw it until you look at that spot again).
  let pickupSeen: ({ x: number; y: number; active: boolean } | null)[] = [];
  const barGhost = new Map<number, { hp: number; hold: number }>();
  let frameDt = 0;

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

  /** A 1:1's own colour (src/config/power.ts ONE_OF_ONE), else the given default. */
  const sigColor = (a: Actor, d: number) => (a.power.signature && a.power.metadataId ? ONE_OF_ONE[a.power.metadataId]?.color ?? d : d);

  function drawBody(g: Graphics, a: Actor, hostile: boolean, marking: number | null, alert: boolean, heard = false) {
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
    // A 1:1 is marked for both sides at all times: a slow ring in its own colour (who you are facing is never hidden).
    if (a.alive && a.power.tier === 'legendary') {
      const c = sigColor(a, P.signal), ph = (performance.now() / 900) % (Math.PI * 2);
      for (let i = 0; i < 4; i++) arc(g, a.x, a.y, r0 * 1.85, ph + i * Math.PI / 2, ph + i * Math.PI / 2 + 0.9, 6).stroke({ width: 0.07, color: c, alpha: 0.9 });
    }
    // Downed (team modes): flat, dimmed, a pulsing ring, and the rescue progress arc. Rescue it or finish it.
    if (a.alive && a.downed) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      circle(g, a.x, a.y, TUNING.revive.range, 40).stroke({ width: 0.05, color: hostile ? P.hostile : P.teamRing, alpha: 0.35 + 0.35 * pulse });
      if (a.reviveProgress > 0) arc(g, a.x, a.y, r0 * 2.1, -Math.PI / 2, -Math.PI / 2 + (a.reviveProgress / TUNING.revive.seconds) * Math.PI * 2, 24).stroke({ width: 0.12, color: P.heal, alpha: 1 });
      alpha = 0.6;
    }
    if (a.alive && !a.downed) drawWeapon(g, a, hostile ? 0x2a1a14 : col('bgElevated'), KEYLINE);
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
    } else if (hostile && heard && a.alive) {
      // CF-D: it heard something and is checking: a hollow mark (did it hear YOU? it is listening this way).
      g.poly([a.x - 0.13, a.y - r - 0.75, a.x + 0.13, a.y - r - 0.75, a.x, a.y - r - 0.42]).stroke({ width: 0.05, color: P.signal });
    }
    const cos = Math.cos(a.facing), sin = Math.sin(a.facing);
    if (!a.alive && a.deadFor > R.deathAnimSeconds * 0.5) {
      g.moveTo(a.x - 0.2, a.y - 0.2).lineTo(a.x + 0.2, a.y + 0.2).moveTo(a.x + 0.2, a.y - 0.2).lineTo(a.x - 0.2, a.y + 0.2)
        .stroke({ width: 0.07, color: KEYLINE, alpha: 0.8 });
    }
    // 1:1 signature telegraphs, drawn for both sides so the effect is readable before and while it acts.
    if (a.alive && a.burstLeft > 0) {
      // The burst's true radius, filling in as it winds up: step out of the ring.
      const R0 = a.ability.radius ?? 3, t = 1 - a.burstLeft / (a.ability.windup ?? 0.5);
      const c = sigColor(a, P.hostile);
      circle(g, a.x, a.y, R0, 48).stroke({ width: 0.05 + 0.1 * t, color: c, alpha: 0.5 + 0.5 * t });
      circle(g, a.x, a.y, R0, 48).fill({ color: c, alpha: 0.08 + 0.12 * t });
    }
    if (a.alive && a.shieldLeft > 0) circle(g, a.x, a.y, r0 * 1.6, 28).stroke({ width: 0.12, color: sigColor(a, px('ammo')), alpha: 0.95 });
    if (a.alive && a.frenzyLeft > 0) g.poly(place(parts.body, a.x, a.y, a.facing, r * 1.22)).stroke({ width: 0.08, color: sigColor(a, P.hostile), alpha: 0.6 + 0.3 * Math.sin(a.frenzyLeft * 12) });
    if (a.alive && a.slowLeft > 0) for (let i = 0; i < 6; i++) arc(g, a.x, a.y, r0 * 1.9, i * Math.PI / 3, i * Math.PI / 3 + 0.5, 4).stroke({ width: 0.06, color: P.armor, alpha: 0.85 });
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

  /** A heard sound (CF-D): one shape per kind, so a step, a shot and a reload read apart with the sound off. */
  function drawMark(m: Marker) {
    glyph(m.kind, m.x, m.y, 0.8 * (1 - m.age / m.life), m.age / m.life, m.ang ?? 0, m.big);
  }
  /** One heard-sound shape at (x, y): alpha `al`, animation phase `t` (0 = just heard), heading `ang` for steps. */
  function glyph(kind: MarkKind | undefined, x: number, y: number, al: number, t: number, ang: number, big: boolean) {
    const g = marks, c = P.signal, m = { x, y, ang, big };
    switch (kind) {
      case 'step': {
        // Two footprints along the walker's heading.
        const a = m.ang ?? 0, cx = Math.cos(a), sy = Math.sin(a);
        for (const side of [-1, 1]) {
          const fx0 = m.x + -sy * side * 0.13 + cx * side * 0.12, fy0 = m.y + cx * side * 0.13 + sy * side * 0.12;
          g.ellipse(fx0, fy0, 0.1, 0.1).fill({ color: c, alpha: al * 0.9 });
        }
        return;
      }
      case 'shot': {
        const r0 = 0.3 + t * 0.6, r1 = r0 + 0.45;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.moveTo(m.x + Math.cos(a) * r0, m.y + Math.sin(a) * r0).lineTo(m.x + Math.cos(a) * r1, m.y + Math.sin(a) * r1); }
        g.stroke({ width: 0.07, color: c, alpha: al });
        return;
      }
      case 'reload':
        for (const k of [-1, 1]) circle(g, m.x + k * 0.16, m.y, 0.07, 8).fill({ color: c, alpha: al });
        arc(g, m.x, m.y, 0.35, Math.PI * 1.1, Math.PI * 1.9, 8).stroke({ width: 0.04, color: c, alpha: al * 0.7 });
        return;
      case 'impact':
        g.moveTo(m.x - 0.12, m.y - 0.12).lineTo(m.x + 0.12, m.y + 0.12).moveTo(m.x + 0.12, m.y - 0.12).lineTo(m.x - 0.12, m.y + 0.12).stroke({ width: 0.05, color: c, alpha: al });
        return;
      case 'grenade':
        circle(g, m.x, m.y, 0.22 + t * 0.3, 14).stroke({ width: 0.05, color: P.ammo, alpha: al });
        circle(g, m.x, m.y, 0.07, 8).fill({ color: P.ammo, alpha: al });
        return;
      default: {
        const rad = (m.big ? 0.9 : 0.45) + t * (m.big ? 1.2 : 0.6);
        circle(g, m.x, m.y, rad).stroke({ width: 0.06, color: c, alpha: 0.75 * (1 - t) });
      }
    }
  }

  /** Where a hostile could be by now: a red DOTTED ring (your own noise is a cream dashed one; a blast ring is solid). */
  function guessRing(g: Graphics, x: number, y: number, rad: number, width: number, alpha: number) {
    const rr = Math.min(rad, 8), n = Math.max(12, Math.round(rr * 9));
    for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2; circle(g, x + Math.cos(a0) * rr, y + Math.sin(a0) * rr, width, 5); }
    g.fill({ color: P.hostile, alpha });
  }

  /**
   * SB contact intel (src/sim/intel.ts): ONE mark per hostile you believe in, shaped by how you know it and faded by how
   * sure you still are. Live bodies (your light, a muzzle flash) and Ping outlines are drawn with the actors.
   * PARTIAL   a teammate's sighting: a red diamond where they saw it (re-placed twice a second, not a live feed).
   * LAST KNOWN where it was when it left every view: its outline and heading, inside a circle that grows as it could
   *            have moved on, fading over ~6 s.
   * HEARD      the sound's own shape (steps leave a short trail of footprints) inside its error circle.
   * DIRECTION  heard through a wall: a tick on a ring around you, pointing at the guess. No spot.
   * SUSPECTED  confidence nearly gone: only the circle. LOST: the circle fades out.
   */
  function drawContacts(w: World, intel: Intel, p: Actor) {
    const I = TUNING.intel;
    for (const c of intel.contacts.values()) {
      if (c.state === 'visible' || (c.state === 'partial' && c.source === 'ping')) continue;
      const fade = c.state === 'lost' ? Math.max(0, 1 - c.lostFor / I.lostSeconds) * 0.3 : c.conf;
      if (c.state !== 'directional' && c.r > 0.5) guessRing(marks, c.x, c.y, c.r, 0.045, (c.state === 'suspected' || c.state === 'lost' ? 0.5 : 0.42) * fade);
      const pulse = c.fresh > 0 ? 1 - c.fresh / I.freshSeconds : 1;
      switch (c.state) {
        case 'partial': case 'last_known': {
          const fromMate = c.source === 'teammate' || c.source === 'callout';
          if (fromMate) {
            const z = 0.38, al = (c.state === 'partial' ? 0.9 : 0.6) * fade;
            actors.poly([c.x, c.y - z, c.x + z, c.y, c.x, c.y + z, c.x - z, c.y]).stroke({ width: 0.07, color: P.hostile, alpha: al });
            circle(actors, c.x, c.y, 0.07, 8).fill({ color: P.hostile, alpha: al });
            // "Lost him, heading west": the way it was going when they last saw it.
            if (c.source === 'callout' && c.state === 'last_known') actors.moveTo(c.x + Math.cos(c.facing) * z, c.y + Math.sin(c.facing) * z).lineTo(c.x + Math.cos(c.facing) * 1.1, c.y + Math.sin(c.facing) * 1.1).stroke({ width: 0.05, color: P.hostile, alpha: al });
            break;
          }
          // Its outline and heading where you last saw it: strong for the first seconds, then just the growing circle.
          const a = w.actors[c.id];
          const al = 0.6 * fade * Math.max(0, Math.min(1, 1 - (c.age - 2.5) / 2));
          if (a && al > 0.02) {
            const parts = partsOf(a.hero.id), r0 = TUNING.movement.radius * R.actorScale;
            actors.poly(place(parts.body, c.x, c.y, c.facing, r0)).stroke({ width: 0.05, color: P.hostile, alpha: al });
            actors.moveTo(c.x, c.y).lineTo(c.x + Math.cos(c.facing) * 0.7, c.y + Math.sin(c.facing) * 0.7).stroke({ width: 0.04, color: P.hostile, alpha: al * 0.85 });
          }
          break;
        }
        case 'heard': {
          if (c.kind === 'step') {
            for (let i = 0; i < c.trail.length; i++) {
              const t = c.trail[i], prev = c.trail[i - 1] ?? t, next = c.trail[i + 1] ?? t;
              const ang = Math.atan2(next.y - prev.y, next.x - prev.x);
              glyph('step', t.x, t.y, 0.8 * fade * Math.max(0, 1 - t.age / I.trailSeconds), 1, ang, false);
            }
          } else glyph(c.kind, c.x, c.y, 0.85 * fade, pulse, 0, c.kind === 'shot');
          break;
        }
        case 'directional': {
          const ang = Math.atan2(c.y - p.y, c.x - p.x), big = c.kind === 'shot' || c.kind === 'grenade';
          arc(marks, p.x, p.y, 1.15, ang - (big ? 0.32 : 0.2), ang + (big ? 0.32 : 0.2), 8).stroke({ width: big ? 0.11 : 0.07, color: P.signal, alpha: Math.min(1, 0.95 * fade + 0.3 * (1 - pulse)) });
          break;
        }
        default:
          break;
      }
    }
  }

  /** SB: a teammate's call-out above its head: cream, short, fading out over its last third. */
  function drawComms(w: World, fx: Fx) {
    let i = 0;
    for (const c of fx.comms) {
      const a = w.actors[c.from];
      if (!a?.alive) continue;
      let t = commsTexts[i];
      if (!t) {
        t = new Text({ text: '', style: { fontFamily: 'Plex Mono, monospace', fontSize: 22, fontWeight: '600', fill: 0xf4ecd8, stroke: { color: 0x0b0c0d, width: 5 } } });
        t.anchor.set(0.5, 1);
        t.scale.set(1 / 70);
        labels.addChild(t);
        commsTexts.push(t);
      }
      if (t.text !== c.text) t.text = c.text;
      const life = TUNING.comms.chipSeconds;
      t.alpha = c.age < life * 0.66 ? 1 : Math.max(0, (life - c.age) / (life * 0.34));
      // Kept on screen: a teammate near the edge still says the whole line (it ran off the side).
      const vw = app.screen.width / ppu / 2 - 0.3, half = t.width / 2;
      const x = half < vw ? Math.min(Math.max(a.x, camX - vw + half), camX + vw - half) : camX;
      t.position.set(x, a.y - TUNING.movement.radius * R.actorScale - 0.62);
      t.visible = true;
      i++;
    }
    for (; i < commsTexts.length; i++) commsTexts[i].visible = false;
  }

  /**
   * CHOG superpowers (src/config/superpowers.ts), drawn for you, your team and hostiles you are shown: a thin charge
   * line then the beam (red Laser, violet X-Ray), globs in flight, the cage, the goo strand to the wall, the aura. A
   * hostile beam you are not shown is drawn only where it crosses you (the counter to X-Ray).
   */
  function drawPowers(w: World, p: Actor, opts: DrawOpts) {
    const g = actors, t = w.tick;
    const shown = (a: Actor) => a === p || a.team === p.team || shownHostiles.includes(a);
    const beamCol = (k: string) => POWER_COLOR[k] ?? POWER_COLOR.laser;
    for (const a of w.actors) {
      if (!a.alive || a.x < -50) continue;
      if (shown(a)) {
        if (a.chargeLeft > 0 || a.beamLeft > 0) {
          const e = beamEnd(w, a), col = beamCol(a.ability.kind);
          if (a.beamLeft > 0) {
            g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 0.34, color: col, alpha: 0.25 });
            g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 0.12, color: 0xfff1e8, alpha: 0.95 });
            circle(g, e.x, e.y, 0.18 + 0.05 * Math.sin(t), 10).fill({ color: col, alpha: 0.8 });
          } else {
            // Charge: a thin line along the aim that brightens as it fills (the telegraph).
            const fill = 1 - a.chargeLeft / (a.ability.windup ?? 0.35);
            g.moveTo(a.x, a.y).lineTo(e.x, e.y).stroke({ width: 0.04 + 0.04 * fill, color: col, alpha: 0.35 + 0.5 * fill });
          }
        }
        if (a.trapLeft > 0) {
          circle(g, a.trapX, a.trapY, a.trapR, 36).fill({ color: POWER_COLOR.bubble, alpha: 0.12 }).stroke({ width: 0.07, color: POWER_COLOR.bubble, alpha: 0.85 });
          circle(g, a.trapX - a.trapR * 0.35, a.trapY - a.trapR * 0.4, a.trapR * 0.18, 10).fill({ color: 0xffffff, alpha: 0.35 });
        }
        if (a.pinLeft > 0) {
          // Goo from the wall spot to the body, and a ring of glue while it holds.
          g.moveTo(a.pinX, a.pinY).lineTo(a.x, a.y).stroke({ width: 0.09, color: POWER_COLOR.drool, alpha: 0.8 });
          circle(g, a.x, a.y, 0.5, 18).stroke({ width: 0.1, color: POWER_COLOR.drool, alpha: 0.75 });
        }
        if (a.auraLeft > 0) {
          const pulse = 0.5 + 0.5 * Math.sin(t / 5);
          circle(g, a.x, a.y, 0.62 + 0.08 * pulse, 28).fill({ color: POWER_COLOR.aura, alpha: 0.14 }).stroke({ width: 0.09, color: POWER_COLOR.aura, alpha: 0.6 + 0.35 * pulse });
        }
      } else if (a.team !== p.team && !opts.beams) {
        const n = beamNear(w, a, p);
        if (n) warnBeam(a.ability.kind === 'xray' ? 'xray' : 'laser', n, a.chargeLeft);
      }
    }
    for (const b of opts.beams ?? []) warnBeam(b.k, b, b.c);
    for (const o of w.orbs) {
      if (o.team !== p.team && Math.hypot(o.x - p.x, o.y - p.y) > 3 && !pointInPolygon(o.x, o.y, poly)) continue;
      if (o.kind === 'bubble') circle(g, o.x, o.y, 0.35, 18).fill({ color: POWER_COLOR.bubble, alpha: 0.35 }).stroke({ width: 0.05, color: POWER_COLOR.bubble, alpha: 0.95 });
      else {
        g.moveTo(o.x - o.dx * 0.5, o.y - o.dy * 0.5).lineTo(o.x, o.y).stroke({ width: 0.08, color: POWER_COLOR.drool, alpha: 0.7 });
        circle(g, o.x, o.y, 0.2, 10).fill({ color: POWER_COLOR.drool, alpha: 0.95 });
      }
    }
  }
  function warnBeam(k: string, n: { x: number; y: number; a: number; len: number }, charge: number) {
    const col = POWER_COLOR[k] ?? POWER_COLOR.laser;
    actors.moveTo(n.x, n.y).lineTo(n.x + Math.cos(n.a) * n.len, n.y + Math.sin(n.a) * n.len)
      .stroke({ width: charge > 0 ? 0.06 : 0.16, color: col, alpha: charge > 0 ? 0.75 : 0.9 });
  }

  // Compact overhead bar for a visible actor: 34x4 px HP, 34x2 px armour (at ppu ~35). A Chog with a superpower wears
  // its power's colour as a pip before the bar, so you can read "this one has X-Ray Eyes" (never anything you cannot see).
  function drawBar(a: Actor, hostile: boolean) {
    const W = 0.96, H = 0.11, x = a.x - W / 2, y = a.y - TUNING.movement.radius * R.actorScale - 0.42;
    bars.rect(x - 0.03, y - 0.03, W + 0.06, H + 0.1).fill({ color: KEYLINE, alpha: 0.75 });
    // CF damage ghost: what the last hits took stays pale for a moment, then drains.
    let gh = barGhost.get(a.id);
    if (!gh || a.hp >= gh.hp) { gh = { hp: a.hp, hold: 0.35 }; barGhost.set(a.id, gh); }
    else if ((gh.hold -= frameDt) <= 0) gh.hp = Math.max(a.hp, gh.hp - a.maxHp * 2 * frameDt);
    if (gh.hp > a.hp && !a.downed) bars.rect(x, y, W * Math.min(1, Math.max(0, gh.hp / a.maxHp)), H).fill({ color: P.signal, alpha: 0.85 });
    bars.rect(x, y, W * Math.min(1, Math.max(0, a.hp / a.maxHp)), H).fill(a.downed ? P.signal : hostile ? P.hostile : P.team);
    // Overheal (a health pickup taken at full health): a cream extension past the bar's end, kept until damage takes it.
    if (a.hp > a.maxHp && !a.downed) bars.rect(x + W, y, W * Math.min(0.25, (a.hp - a.maxHp) / a.maxHp), H).fill(P.signal);
    if (a.maxArmor > 0 && a.armor > 0) bars.rect(x, y + H + 0.015, W * Math.min(1, a.armor / a.maxArmor), 0.05).fill(P.armor);
    if (a.ability.power) {
      const cx = x - 0.16, cy = y + H / 2;
      bars.poly([cx, cy - 0.1, cx + 0.1, cy, cx, cy + 0.1, cx - 0.1, cy]).fill(POWER_COLOR[a.ability.power]).stroke({ width: 0.025, color: KEYLINE });
    }
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
      const inView = (x: number, y: number) => !!explored[Math.floor(y) * level.w + Math.floor(x)] && (!LAB.dark || pointInPolygon(x, y, poly));
      const col = p.kind === 'health' ? P.heal : p.kind === 'armor' ? P.armor : p.kind === 'grenade' ? P.grenade : P.ammo;
      const lit = inView(p.x, p.y);
      let m = pickupSeen[i];
      if (lit) m = pickupSeen[i] = { x: p.x, y: p.y, active: p.active };
      // You look at the spot where you saw it, and it has moved: forgotten.
      else if (m && (m.x !== p.x || m.y !== p.y) && inView(m.x, m.y)) m = pickupSeen[i] = null;
      const at = lit ? p : m;
      if (!at) { lbl.visible = false; return; }
      // Keep the label out from under HUD panels: below by default, above if blocked, hidden if both are.
      const sx = world.position.x + at.x * ppu, sy = world.position.y + at.y * ppu;
      const pl = placeLabel(sx, sy, lbl.width * ppu, lbl.height * ppu, 0.38 * ppu, hud);
      lbl.visible = pl.visible;
      lbl.position.set(at.x, at.y + (pl.y - sy) / ppu);
      if (!lit && m!.active) {
        // Remembered, not watched: drawn as you last saw it, without the glow or the respawn clock.
        props.roundRect(m!.x - 0.3, m!.y - 0.3, 0.6, 0.6, 0.1).fill({ color: px('bgPanel'), alpha: 0.55 }).stroke({ width: 0.04, color: col, alpha: 0.45 });
        lbl.alpha = 0.45;
        return;
      }
      if (!lit) { circle(props, m!.x, m!.y, 0.32).stroke({ width: 0.04, color: col, alpha: 0.3 }); lbl.alpha = 0.35; return; }
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
      else if (p.kind === 'grenade') { circle(props, p.x, p.y + 0.03 + bob, 0.15).fill(col); props.rect(p.x - 0.05, p.y - 0.2 + bob, 0.1, 0.09).rect(p.x + 0.02, p.y - 0.2 + bob, 0.14, 0.04).fill(col); }
      else for (let k = 0; k < 3; k++) props.rect(p.x - 0.17 + k * 0.13, p.y - 0.16 + bob, 0.08, 0.32).fill(col);
    });
    // GP loot bags (what a fallen operator carried): a bright satchel with a dot per kind still in it and a ring that
    // runs down to its timeout. Pulses when it holds something you would take. Only what your light shows.
    const pal = TUNING.palette;
    let li = 0;
    for (const l of w.loot) {
      const lit = !!explored[Math.floor(l.y) * level.w + Math.floor(l.x)] && (!LAB.dark || pointInPolygon(l.x, l.y, poly));
      if (!lit) continue;
      const bob = Math.sin(w.tick / 16 + l.id) * 0.04;
      if (me.alive && !me.downed && lootTake(me, l)) {
        const pulse = 0.5 + 0.5 * Math.sin(w.tick / 8);
        circle(props, l.x, l.y + bob, 0.55 + pulse * 0.08, 28).fill({ color: P.signal, alpha: 0.12 + pulse * 0.1 }).stroke({ width: 0.06, color: P.signal, alpha: 0.5 + pulse * 0.4 });
      }
      props.ellipse(l.x + 0.05, l.y + 0.14, 0.4, 0.26).fill({ color: 0x000000, alpha: 0.35 });
      props.roundRect(l.x - 0.36, l.y - 0.28 + bob, 0.72, 0.56, 0.14).fill(px('bgPanel')).stroke({ width: 0.07, color: P.signal });
      props.rect(l.x - 0.14, l.y - 0.36 + bob, 0.28, 0.1).fill(P.signal);
      const dots = [l.health >= 1 ? pal.heal : -1, l.armor >= 1 ? pal.armor : -1, l.mags >= 0.05 ? pal.ammo : -1, l.grenades > 0 ? pal.grenade : -1].filter((c) => c >= 0);
      dots.forEach((c, k) => circle(props, l.x - (dots.length - 1) * 0.085 + k * 0.17, l.y + 0.02 + bob, 0.07).fill(c));
      arc(props, l.x, l.y + bob, 0.46, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, l.left / TUNING.loot.seconds)) * Math.PI * 2).stroke({ width: 0.04, color: P.signal, alpha: 0.7 });
      let t = lootLabels[li];
      if (!t) {
        t = new Text({ text: 'LOOT', style: { fontFamily: 'Plex Mono, monospace', fontSize: 22, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        t.anchor.set(0.5, 0);
        t.scale.set(1 / 80);
        t.tint = P.signal;
        labels.addChild(t);
        lootLabels.push(t);
      }
      t.visible = true;
      t.text = l.perk ? `LOOT · ${PERKS[l.perk].name.toUpperCase()}` : 'LOOT';
      t.position.set(l.x, l.y + 0.42);
      li++;
    }
    for (; li < lootLabels.length; li++) lootLabels[li].visible = false;
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
      const key = `${w.level.w}x${w.level.h}:${w.level.tiles.join('')}:${LAB.dark ? 1 : 0}`;
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
      barGhost.clear(); pickupSeen = w.pickups.map(() => null);
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
        t.text = pk.kind === 'health' ? 'HEALTH' : pk.kind === 'armor' ? 'ARMOUR' : pk.kind === 'grenade' ? 'GRENADE' : 'AMMO';
        t.tint = pk.kind === 'health' ? P.heal : pk.kind === 'armor' ? P.armor : pk.kind === 'grenade' ? P.grenade : P.ammo;
        t.position.set(pk.x, pk.y + 0.38);
      });
      for (let i = w.pickups.length; i < pickupLabels.length; i++) pickupLabels[i].visible = false;
    },
    visibleBots: () => visBots,
    visPoly: () => poly,
    flashBots: () => flashBots,
    offscreenMarks: () => offscreenMarks,
    draw(w, fx, input, dt, opts) {
      frameDt = dt;
      const p = player(w);
      const sw = app.screen.width, sh = app.screen.height;
      const portrait = sh > sw;
      ppu = viewScale(sw, sh, R) * (opts.menu ?? 1);
      const CT = portrait ? PORTRAIT_CAM : R;
      const cursor = input.mode === 'pc' && opts.playing ? { dx: (input.mouseX - sw / 2) / ppu, dy: (input.mouseY - sh / 2) / ppu } : undefined;
      stepCamera(cam, p.x, p.y, leadTarget(p.facing, CT, cursor), dt, CT);
      camX = cam.x;
      camY = cam.y;
      if (opts.menu) { cam.x = camX = p.x; cam.y = camY = p.y; cam.lx = cam.ly = 0; }
      else if (portrait) {
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
      for (const m of fx.markers) drawMark(m);
      // CF-C: your own noise runs out to where it is really heard, then is gone (dashed: a sound, not a wall).
      for (const n of fx.noise) {
        const t = Math.min(1, n.age / TUNING.sound.ownNoiseSeconds), r = 0.45 + (n.r - 0.45) * (1 - (1 - t) * (1 - t));
        const dashes = Math.max(10, Math.round(n.r * 5));
        for (let i = 0; i < dashes; i += 1) {
          const a0 = (i / dashes) * Math.PI * 2;
          arc(marks, n.x, n.y, r, a0, a0 + (Math.PI / dashes) * 0.9, 3);
        }
        marks.stroke({ width: 0.045, color: P.signal, alpha: 0.38 * (1 - t) });
      }
      for (const c of fx.corpses) {
        marks.ellipse(c.x, c.y, 0.42, 0.3).fill({ color: c.hostile ? P.hostileDark : P.teamDark, alpha: 0.55 });
      }
      // Grenades (docs/design/roster-grenades.md): your side's always; a hostile one in your light or close to you (you
      // hear it land). The ring is the true blast radius and fills as the fuse runs: step out of it or get a wall between.
      const GR = TUNING.grenade;
      for (const g of w.grenades) {
        const mine = g.team === p.team;
        if (!mine && Math.hypot(g.x - p.x, g.y - p.y) > GR.radius + 1.5 && !pointInPolygon(g.x, g.y, poly)) continue;
        const t = Math.min(1, Math.max(0, 1 - g.fuse / GR.fuseSeconds));
        const col = mine ? P.ammo : P.hostile;
        circle(marks, g.x, g.y, GR.radius * t, 32).fill({ color: col, alpha: 0.06 + 0.12 * t });
        circle(marks, g.x, g.y, GR.radius, 40).stroke({ width: 0.05, color: col, alpha: 0.55 });
        arc(marks, g.x, g.y, GR.radius, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2, 40).stroke({ width: 0.12, color: col, alpha: 0.95 });
        // The grenade itself, lifted off its shadow while it still flies fast (top-down arc).
        const lift = Math.min(0.32, Math.hypot(g.vx, g.vy) * 0.025);
        marks.ellipse(g.x, g.y + 0.04, 0.17, 0.12).fill({ color: 0x000000, alpha: 0.45 });
        circle(marks, g.x, g.y - lift, 0.16, 12).fill(0x3a3f2c).stroke({ width: 0.05, color: col });
      }

      actors.clear();
      bars.clear();
      visBots = 0;
      flashBots = 0;
      shownHostiles.length = 0;
      const rev = revealed(w, p);
      const mates = w.actors.filter((m) => m !== p && m.team === p.team && m.alive && !m.downed && m.x > -50);
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
          let mode = enemyDrawMode(level, p, view, a, {
            recapKiller: !!opts.recap && w.playerKill?.killerId === a.id,
            threatLeft: fx.threats[a.id] ?? 0,
            pinged: rev.includes(a),
          });
          // Team vision: a hostile one of your standing teammates sees (AI teammates in the default game, real ones
          // online). Nobody sees through walls: it is their cone, with their line of sight. Before CF it was drawn as a
          // live body; CF-E makes it a SPOTTED mark that updates twice a second: your teammate saw something, you did not.
          // (SB: with LAB.dark on that sighting is the player's PARTIAL contact, drawn by drawContacts below.)
          if (mode === null && teamSighting() === 'body' && a.alive && mates.some((m) => canSee(level, m.x, m.y, m.facing, m.view, a.x, a.y))) mode = 'body';
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
          drawBody(actors, a, true, null, br?.state === 'alert', br?.state === 'investigate' || (br?.listen ?? 0) > 0);
          if (a.alive && !opts.menu) drawBar(a, true);
        }
      }
      drawContacts(w, fx.intel, p);
      drawPowers(w, p, opts);
      drawBody(actors, p, false, opts.marking, false);
      if (p.alive && !opts.menu) drawBar(p, false);
      drawComms(w, fx);
      if (opts.debug) drawDebug(w);
      else if (debugG.children.length || debugTexts.length) { debugG.clear(); for (const t of debugTexts) t.visible = false; }
      // Firing arc on touch (CF-B): always drawn faintly in play so you see it close when you stop, brighter while aiming.
      if (opts.showSticks && p.alive && (input.right.active || LAB.steady)) {
        const sp = p.lastSpread * DEG, L = Math.min(p.weapon.falloffEnd, 6);
        actors.moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing - sp) * L, p.y + Math.sin(p.facing - sp) * L)
          .moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing + sp) * L, p.y + Math.sin(p.facing + sp) * L)
          .stroke({ width: 0.03, color: P.team, alpha: input.right.active ? 0.4 : 0.18 });
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
        circle(fxG, pg.x, pg.y, 0.5 + t * (pg.r ?? TUNING.abilities.sonarRadius), 64).stroke({ width: 0.08, color: pg.color ?? (pg.hostile ? P.hostile : P.armor), alpha: 0.7 * (1 - t) });
      }
      for (const rg of fx.rings) {
        const t = rg.age / RING_SECONDS;
        circle(fxG, rg.x, rg.y, rg.r * (0.6 + 0.4 * t), 48).stroke({ width: 0.14 * (1 - t) + 0.03, color: rg.color, alpha: 0.9 * (1 - t) });
      }
      for (const c of fx.collects) {
        const t = c.age / COLLECT_SECONDS;
        circle(fxG, c.x, c.y, 0.45 + t * 0.9, 32).stroke({ width: 0.1 * (1 - t) + 0.02, color: c.color, alpha: 0.9 * (1 - t) });
      }

      // CF grenade aim: where it will come to rest (walls bounce it short), with its true blast ring.
      const np = p.alive && opts.playing && p.grenades > 0 ? input.nadePreview(r.toScreen(p.x, p.y).x, r.toScreen(p.x, p.y).y, ppu) : null;
      if (np) {
        const lx = p.x + Math.cos(np.ang) * np.dist, ly = p.y + Math.sin(np.ang) * np.dist, GR = TUNING.grenade.radius;
        fxG.moveTo(p.x + Math.cos(np.ang) * 0.6, p.y + Math.sin(np.ang) * 0.6).lineTo(lx, ly).stroke({ width: 0.04, color: P.ammo, alpha: 0.6 });
        for (let i = 0; i < 28; i++) { const a0 = (i / 28) * Math.PI * 2; arc(fxG, lx, ly, GR, a0, a0 + Math.PI / 28, 3); }
        fxG.stroke({ width: 0.06, color: P.ammo, alpha: 0.85 });
        circle(fxG, lx, ly, 0.16, 12).fill({ color: P.ammo, alpha: 0.9 });
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
        // CF-A: while the body is still turning, a tick shows where the gun points now (it catches up in a moment).
        if (LAB.turn && p.aimLag > 4 * DEG) {
          const gx = ps.x + Math.cos(p.facing) * d, gy = ps.y + Math.sin(p.facing) * d;
          screen.circle(gx, gy, 4).stroke({ width: 1.5, color: P.signal, alpha: 0.8 });
        }
      }
      // Damage direction: a red arc around the player toward where the shot came from.
      // V2: a shooter you could not see when it hit you also gets its distance on the arc ("9 m"), so a hit from
      // the dark reads as "someone out there saw me", with where and how far, not as a bot that knew.
      let tags = 0;
      for (const da of fx.damageArcs) {
        const al = 1 - da.age / R.damageArcSeconds;
        arc(screen, ps.x, ps.y, ppu * 1.4, da.ang - 0.38, da.ang + 0.38, 12).stroke({ width: 6, color: P.hostile, alpha: 0.9 * al });
        if (da.far <= 0) continue;
        let t = arcTagPool[tags];
        if (!t) {
          t = new Text({ text: '', style: { fontFamily: 'Plex Mono, monospace', fontSize: 14, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
          t.anchor.set(0.5);
          t.tint = P.hostile;
          arcTags.addChild(t);
          arcTagPool.push(t);
        }
        t.text = `${Math.round(da.far)} m`;
        t.position.set(ps.x + Math.cos(da.ang) * ppu * 1.4 + Math.cos(da.ang) * 22, ps.y + Math.sin(da.ang) * ppu * 1.4 + Math.sin(da.ang) * 22);
        t.alpha = al;
        t.visible = true;
        tags++;
      }
      for (let i = tags; i < arcTagPool.length; i++) arcTagPool[i].visible = false;
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
      // A fresh heard contact past the screen edge: a cream chevron toward it (direction only, like the sound).
      const margin = 22;
      for (const c of fx.intel.contacts.values()) {
        if (opts.menu || (c.state !== 'heard' && c.state !== 'directional') || c.age > TUNING.sound.markerLife) continue;
        const s = r.toScreen(c.x, c.y);
        if (s.x > 0 && s.x < sw && s.y > 0 && s.y < sh) continue;
        const ang = Math.atan2(s.y - sh / 2, s.x - sw / 2);
        const ex = Math.max(margin, Math.min(sw - margin, sw / 2 + Math.cos(ang) * sw));
        const ey = Math.max(margin, Math.min(sh - margin, sh / 2 + Math.sin(ang) * sh));
        const cs = Math.cos(ang), sn = Math.sin(ang), z = c.kind === 'shot' ? 13 : 9;
        screen.poly([ex + cs * z, ey + sn * z, ex - sn * z * 0.6, ey + cs * z * 0.6, ex + sn * z * 0.6, ey - cs * z * 0.6])
          .fill({ color: P.signal, alpha: 0.85 * c.conf * (1 - c.age / TUNING.sound.markerLife) });
      }
    },
  };
  return r;
}
