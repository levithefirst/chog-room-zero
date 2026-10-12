// Drawing only. Reads sim state and never writes it. The vision polygon is the lighting: lit floor is
// clipped to it, remembered tiles are dim, unknown is near black. Hostiles are drawn only when visible.
import { Application, Container, Graphics } from 'pixi.js';
import { TUNING } from '../config/tuning';
import { COVER, WALL, type Level } from '../sim/level';
import { pointInPolygon } from '../sim/geom';
import { visibilityPolygon, canSee } from '../sim/vision';
import { player, viewOf, type Actor, type World } from '../sim/world';
import type { Brain } from '../sim/bots';
import { STICK_RADIUS, AIM_DEADZONE, type Input } from '../input/input';

const P = TUNING.palette;

// Pixi picks circle segments from the local radius; at world scale (0.35 u) that looks octagonal.
// Draw our own 32-sided circles instead.
// Pixi keeps a reference to the points array, so each circle needs its own.
function circle(g: Graphics, x: number, y: number, r: number): Graphics {
  const pts = new Array<number>(64);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts[i * 2] = x + Math.cos(a) * r;
    pts[i * 2 + 1] = y + Math.sin(a) * r;
  }
  return g.poly(pts, true);
}
const DEG = Math.PI / 180;

export interface Marker {
  x: number;
  y: number;
  age: number;
  life: number;
  big: boolean;
}

export interface Fx {
  markers: Marker[];
  impacts: { x: number; y: number; age: number }[];
  hitMarks: { x: number; y: number; age: number; kill: boolean }[];
  shake: number;
  corpses: { x: number; y: number; hostile: boolean }[];
}

export interface Renderer {
  app: Application;
  /** Screen position of a world point (after the camera of the last frame). */
  toScreen(x: number, y: number): { x: number; y: number };
  draw(w: World, fx: Fx, input: Input, dt: number, opts: { recap: boolean; marking: number | null; showSticks: boolean; playing: boolean }): void;
  reset(w: World): void;
  visibleBots(): number;
}

export async function createRenderer(parent: HTMLElement): Promise<Renderer> {
  const app = new Application();
  await app.init({
    background: P.unknown,
    resizeTo: parent,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  parent.appendChild(app.canvas);

  const world = new Container();
  const memory = new Graphics();
  const lit = new Container();
  const litFloor = new Graphics();
  const visMask = new Graphics();
  const marks = new Graphics();
  const actors = new Graphics();
  const recapG = new Graphics();
  const screen = new Graphics();
  lit.addChild(litFloor);
  lit.mask = visMask;
  world.addChild(memory, lit, visMask, marks, actors, recapG);
  app.stage.addChild(world, screen);

  let level: Level;
  let explored: Uint8Array;
  let exploredCount = -1;
  let camX = 0, camY = 0, ppu = 40;
  const poly: number[] = [];
  let visBots = 0;
  let exploreTimer = 0;

  function drawLitFloor() {
    litFloor.clear();
    litFloor.rect(0, 0, level.w, level.h).fill(P.floorLit);
    // Faint tile seams so speed and distance read on the floor. Only inside the light.
    for (let x = 1; x < level.w; x++) litFloor.moveTo(x, 0).lineTo(x, level.h);
    for (let y = 1; y < level.h; y++) litFloor.moveTo(0, y).lineTo(level.w, y);
    litFloor.stroke({ width: 0.02, color: 0x000000, alpha: 0.18 });
    for (const b of level.coverBoxes) litFloor.rect(b.x0 + 0.08, b.y0 + 0.08, b.x1 - b.x0 - 0.16, b.y1 - b.y0 - 0.16).fill(P.cover);
  }

  function drawMemory() {
    memory.clear();
    const { w, h, tiles } = level;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!explored[y * w + x]) continue;
        const t = tiles[y * w + x];
        if (t === WALL) memory.rect(x, y, 1, 1).fill(P.wall);
        else memory.rect(x, y, 1, 1).fill(P.floorRemembered);
        if (t === COVER) memory.rect(x + 0.08, y + 0.08, 0.84, 0.84).fill({ color: P.cover, alpha: 0.35 });
      }
    }
    // Wall rims: a thin lighter edge, one unit at a time, only where the floor beside it has been seen.
    const seenFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && explored[y * w + x] === 1 && tiles[y * w + x] !== WALL;
    for (const s of level.segments) {
      if (s.ay === s.by) {
        for (let x = Math.min(s.ax, s.bx); x < Math.max(s.ax, s.bx); x++) {
          if (seenFloor(x, s.ay - 1) || seenFloor(x, s.ay)) memory.rect(x, s.ay - 0.025, 1, 0.05);
        }
      } else {
        for (let y = Math.min(s.ay, s.by); y < Math.max(s.ay, s.by); y++) {
          if (seenFloor(s.ax - 1, y) || seenFloor(s.ax, y)) memory.rect(s.ax - 0.025, y, 0.05, 1);
        }
      }
    }
    memory.fill(P.wallEdge);
  }

  function updateExplored(p: Actor) {
    const r = Math.ceil(p.op.range) + 1;
    const { w, h, tiles } = level;
    let n = 0;
    for (let y = Math.max(0, Math.floor(p.y) - r); y < Math.min(h, Math.floor(p.y) + r + 1); y++) {
      for (let x = Math.max(0, Math.floor(p.x) - r); x < Math.min(w, Math.floor(p.x) + r + 1); x++) {
        const i = y * w + x;
        if (explored[i]) continue;
        if (tiles[i] === WALL) {
          // A wall is known once a lit floor tile touches it.
          const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const tx = x + dx, ty = y + dy;
            return tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty * w + tx] !== WALL && pointInPolygon(tx + 0.5, ty + 0.5, poly);
          });
          if (touch) { explored[i] = 1; n++; }
        } else if (pointInPolygon(x + 0.5, y + 0.5, poly)) {
          explored[i] = 1;
          n++;
        }
      }
    }
    if (n) exploredCount += n;
  }

  function drawBody(g: Graphics, a: Actor, hostile: boolean, marking: number | null, alert: boolean) {
    const r = TUNING.movement.radius;
    const c = !a.alive ? 0x6f6a60 : a.hitFlash > 0 ? 0xffffff : hostile ? P.hostile : P.player;
    const cos = Math.cos(a.facing), sin = Math.sin(a.facing);
    // Facing: a barrel that sticks out past the body. Readable at phone scale.
    g.moveTo(a.x + cos * r * 0.4, a.y + sin * r * 0.4).lineTo(a.x + cos * r * 1.75, a.y + sin * r * 1.75)
      .stroke({ width: 0.11, color: c });
    if (hostile) {
      // Hostiles are angular: a blunt arrowhead pointing where they look.
      const px = -sin, py = cos;
      g.poly([
        a.x + cos * r * 1.15, a.y + sin * r * 1.15,
        a.x + px * r - cos * r * 0.8, a.y + py * r - sin * r * 0.8,
        a.x - cos * r * 0.35, a.y - sin * r * 0.35,
        a.x - px * r - cos * r * 0.8, a.y - py * r - sin * r * 0.8,
      ]).fill(c);
      if (alert) {
        // Telegraph: it has seen something and is about to commit.
        g.rect(a.x - 0.05, a.y - r - 0.6, 0.1, 0.32).fill(P.signal);
      }
    } else {
      // The player is round.
      circle(g, a.x, a.y, r).fill(c);
      if (marking !== null) circle(g, a.x, a.y, r * 0.55).stroke({ width: 0.09, color: marking });
    }
    if (a.muzzle > 0) {
      const mx = a.x + cos * r * 1.9, my = a.y + sin * r * 1.9;
      g.poly([mx + cos * 0.35, my + sin * 0.35, mx - sin * 0.1, my + cos * 0.1, mx + sin * 0.1, my - cos * 0.1]).fill(P.signal);
    }
  }

  const r: Renderer = {
    app,
    toScreen(x, y) {
      return { x: (x - camX) * ppu + app.screen.width / 2, y: (y - camY) * ppu + app.screen.height / 2 };
    },
    reset(w) {
      level = w.level;
      explored = new Uint8Array(level.w * level.h);
      exploredCount = 0;
      const p = player(w);
      camX = p.x;
      camY = p.y;
      drawLitFloor();
      memory.clear();
      exploredCount = -1;
    },
    visibleBots: () => visBots,
    draw(w, fx, input, dt, opts) {
      const p = player(w);
      const sw = app.screen.width, sh = app.screen.height;
      ppu = Math.min(sw / TUNING.render.viewWidthUnits, sh / TUNING.render.minViewHeightUnits);

      // Camera: smooth follow with a small lookahead toward the aim.
      const tx = p.x + Math.cos(p.facing) * TUNING.render.lookahead;
      const ty = p.y + Math.sin(p.facing) * TUNING.render.lookahead;
      const k = 1 - Math.exp(-dt / TUNING.render.cameraSmoothing);
      camX += (tx - camX) * k;
      camY += (ty - camY) * k;
      let sx = 0, sy = 0;
      if (fx.shake > 0) {
        const s = (TUNING.render.shakePx * fx.shake) / TUNING.render.shakeSeconds;
        sx = (Math.random() * 2 - 1) * s;
        sy = (Math.random() * 2 - 1) * s;
      }
      world.scale.set(ppu);
      world.position.set(sw / 2 - camX * ppu + sx, sh / 2 - camY * ppu + sy);

      // Light.
      const view = viewOf(p);
      visibilityPolygon(level, p.x, p.y, p.facing, view, TUNING.vision.rayStepDeg * DEG, poly);
      visMask.clear().poly(poly.slice()).fill(0xffffff);
      exploreTimer -= dt;
      if (exploreTimer <= 0 || exploredCount < 0) {
        exploreTimer = 0.1;
        const before = exploredCount;
        if (exploredCount < 0) exploredCount = 0;
        updateExplored(p);
        if (exploredCount !== before) drawMemory();
      }

      // Heard markers: shape says "heard", not "seen". Rings, never a body.
      marks.clear();
      for (const m of fx.markers) {
        const t = m.age / m.life;
        const rad = (m.big ? 0.9 : 0.45) + t * (m.big ? 1.2 : 0.6);
        circle(marks, m.x, m.y, rad).stroke({ width: 0.06, color: P.signal, alpha: 0.7 * (1 - t) });
      }
      for (const c of fx.corpses) {
        marks.moveTo(c.x - 0.25, c.y - 0.25).lineTo(c.x + 0.25, c.y + 0.25).moveTo(c.x + 0.25, c.y - 0.25).lineTo(c.x - 0.25, c.y + 0.25)
          .stroke({ width: 0.08, color: c.hostile ? P.hostile : P.player, alpha: 0.5 });
      }

      // Actors, bullets, impacts: only what the player can see.
      actors.clear();
      visBots = 0;
      for (const a of w.actors) {
        if (!a.alive) continue;
        if (a.team === 'bot') {
          const seen = canSee(level, p.x, p.y, p.facing, view, a.x, a.y) || (opts.recap && w.playerKill?.killerId === a.id);
          if (!seen) continue;
          visBots++;
          const br = w.brains.get(a.id) as Brain;
          drawBody(actors, a, true, null, br.state === 'alert');
        } else drawBody(actors, a, false, opts.marking, false);
      }
      if (!p.alive) drawBody(actors, p, false, opts.marking, false);
      if (opts.showSticks && input.right.active && p.alive) {
        // Touch has no crosshair: show the current spread as a faint wedge ahead of the barrel.
        const sp = p.lastSpread * DEG, L = 3.2;
        actors.moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing - sp) * L, p.y + Math.sin(p.facing - sp) * L)
          .moveTo(p.x, p.y).lineTo(p.x + Math.cos(p.facing + sp) * L, p.y + Math.sin(p.facing + sp) * L)
          .stroke({ width: 0.03, color: P.player, alpha: 0.35 });
      }
      for (const b of w.bullets) {
        if (!pointInPolygon(b.x, b.y, poly)) continue;
        const travelled = Math.hypot(b.x - b.ox, b.y - b.oy);
        const len = Math.min(0.9, travelled);
        const hostile = b.owner !== 0;
        actors.moveTo(b.x - b.dx * len, b.y - b.dy * len).lineTo(b.x, b.y)
          .stroke({ width: 0.07, color: hostile ? 0xff9a6b : P.signal });
      }
      for (const im of fx.impacts) {
        if (!pointInPolygon(im.x, im.y, poly)) continue;
        const s = 0.12 + im.age;
        actors.moveTo(im.x - s, im.y).lineTo(im.x + s, im.y).moveTo(im.x, im.y - s).lineTo(im.x, im.y + s)
          .stroke({ width: 0.04, color: P.signal, alpha: 1 - im.age * 8 });
      }
      for (const h of fx.hitMarks) {
        const s = 0.22, a = 1 - h.age / 0.15;
        actors.moveTo(h.x - s, h.y - s).lineTo(h.x + s, h.y + s).moveTo(h.x + s, h.y - s).lineTo(h.x - s, h.y + s)
          .stroke({ width: h.kill ? 0.1 : 0.06, color: h.kill ? P.hostile : 0xffffff, alpha: a });
      }

      // Death recap: the line of the killing shot, from where the killer stood.
      recapG.clear();
      if (opts.recap && w.playerKill) {
        const k = w.playerKill;
        recapG.moveTo(k.fromX, k.fromY).lineTo(k.toX, k.toY).stroke({ width: 0.06, color: P.hostile, alpha: 0.9 });
        circle(recapG, k.fromX, k.fromY, 0.6).stroke({ width: 0.06, color: P.hostile });
      }

      // Screen space: crosshair with visible spread, touch sticks, edge indicators.
      screen.clear();
      if (input.mode === 'pc' && p.alive && opts.playing) {
        const ps = r.toScreen(p.x, p.y);
        const d = Math.hypot(input.mouseX - ps.x, input.mouseY - ps.y);
        const gap = Math.max(4, Math.tan(p.lastSpread * DEG) * d);
        const mx = input.mouseX, my = input.mouseY;
        screen.moveTo(mx - gap - 7, my).lineTo(mx - gap, my).moveTo(mx + gap, my).lineTo(mx + gap + 7, my)
          .moveTo(mx, my - gap - 7).lineTo(mx, my - gap).moveTo(mx, my + gap).lineTo(mx, my + gap + 7)
          .stroke({ width: 2, color: P.player, alpha: 0.9 });
        screen.circle(mx, my, 1.2).fill(P.player);
      }
      if (opts.showSticks) {
        for (const s of [input.left, input.right]) {
          if (!s.active) continue;
          screen.circle(s.baseX, s.baseY, STICK_RADIUS).stroke({ width: 2, color: P.player, alpha: 0.25 });
          if (s === input.right) screen.circle(s.baseX, s.baseY, STICK_RADIUS * AIM_DEADZONE).stroke({ width: 1.5, color: P.signal, alpha: 0.4 });
          screen.circle(s.x, s.y, 18).fill({ color: P.player, alpha: 0.35 });
        }
      }
      const margin = 22;
      for (const m of fx.markers) {
        const s = r.toScreen(m.x, m.y);
        if (s.x > 0 && s.x < sw && s.y > 0 && s.y < sh) continue;
        // Off-screen heard sound: a small wedge on the screen edge pointing at it.
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
