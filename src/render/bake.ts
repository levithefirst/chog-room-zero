// Bakes the map once into two textures: LIT (as the light shows it) and DIM (out of sight: darker, cooler,
// desaturated, still readable). Everything is procedural: no image assets. Drawn in world units, scaled by bakePpu.
import { Container, Graphics, RenderTexture, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { TUNING } from '../config/tuning';
import { ZONES, type Material } from '../config/map';
import { BARRIER, COVER, DOOR, WALL, walkable, type Level } from '../sim/level';
import { coverDrawBox } from './footprint';
import { LAB } from '../config/lab';

// Material base colours (lit). Floors sit in the middle of the value range; walls are dark masses with a lit rim.
export const MAT = {
  tile: { base: 0x5c6264, alt: 0x565c5e, grout: 0x3c4042 },
  concrete: { base: 0x6a655c, alt: 0x635e55, grout: 0x4a463f },
  metal: { base: 0x50575a, alt: 0x4a5154, grout: 0x33393b },
  dock: { base: 0x5e5848, alt: 0x585242, grout: 0x403b30 },
  wallTop: 0x2c2c2f,
  wallFace: 0x18181a,
  wallRim: 0x8e887b,
  crate: 0x86663e,
  crateLid: 0x9a7a4a,
  crateEdge: 0x3b2a17,
  barrier: 0x8b8983,
  barrierEdge: 0x45443f,
  stripe: 0x9a7f3e,
  door: 0x9a8a68,
};

function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function materialAt(x: number, y: number, zones: Level['materials'] = ZONES): Material {
  let m: Material = 'concrete';
  for (const z of zones ?? ZONES) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) m = z.mat;
  return m;
}

function drawMap(g: Graphics, l: Level): void {
  const rnd = mulberry(77);
  const { w, h, tiles } = l;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? WALL : tiles[y * w + x]);

  // 1. Floors with their material pattern (also under cover so crates sit on something).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y * w + x];
      if (t === WALL) continue;
      const m = MAT[materialAt(x, y, l.materials)];
      const mat = materialAt(x, y, l.materials);
      g.rect(x, y, 1, 1).fill(((x + y) & 1) === 0 ? m.base : m.alt);
      if (mat === 'tile') {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const v = rnd();
          if (v < 0.35) g.rect(x + i * 0.5, y + j * 0.5, 0.5, 0.5).fill({ color: v < 0.17 ? 0xffffff : 0x000000, alpha: 0.035 });
        }
        g.rect(x, y + 0.49, 1, 0.025).fill({ color: m.grout, alpha: 0.9 }).rect(x + 0.49, y, 0.025, 1).fill({ color: m.grout, alpha: 0.9 });
        g.rect(x, y, 1, 0.025).fill({ color: m.grout, alpha: 0.9 }).rect(x, y, 0.025, 1).fill({ color: m.grout, alpha: 0.9 });
      } else if (mat === 'metal') {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const cx = x + 0.125 + i * 0.25, cy = y + 0.125 + j * 0.25, d = ((i + j) & 1) === 0 ? 1 : -1;
          g.moveTo(cx - 0.05, cy - 0.05 * d).lineTo(cx + 0.05, cy + 0.05 * d);
        }
        g.stroke({ width: 0.025, color: 0xc8d0d4, alpha: 0.13 });
        if (x % 2 === 0) g.rect(x, y, 0.03, 1).fill({ color: m.grout, alpha: 0.8 });
        if (y % 2 === 0) g.rect(x, y, 1, 0.03).fill({ color: m.grout, alpha: 0.8 });
        if (x % 2 === 0 && y % 2 === 0) g.circle(x + 0.12, y + 0.12, 0.035).fill({ color: 0x9aa2a6, alpha: 0.35 });
      } else if (mat === 'concrete') {
        for (let k = 0; k < 7; k++) g.rect(x + rnd(), y + rnd(), 0.04, 0.04).fill({ color: rnd() < 0.5 ? 0xffffff : 0x000000, alpha: 0.08 });
        if (x % 3 === 0) g.rect(x, y, 0.02, 1).fill({ color: m.grout, alpha: 0.6 });
        if (y % 3 === 0) g.rect(x, y, 1, 0.02).fill({ color: m.grout, alpha: 0.6 });
      } else {
        for (let k = 0; k < 5; k++) g.rect(x + rnd(), y + rnd(), 0.05, 0.03).fill({ color: 0x000000, alpha: 0.1 });
        if (y % 2 === 0) g.rect(x, y, 1, 0.025).fill({ color: m.grout, alpha: 0.7 });
      }
    }
  }

  // 2. Painted markings: hazard band where the dock meets the concourse, lane lines on the concourse.
  for (let x = 1; x < w - 1; x++) {
    if (materialAt(x, 23, l.materials) === 'dock' && walkable(at(x, 23))) {
      for (let k = 0; k < 4; k++) g.poly([x + k * 0.25, 23, x + k * 0.25 + 0.12, 23, x + k * 0.25 + 0.02, 23.22, x + k * 0.25 - 0.1, 23.22]).fill({ color: MAT.stripe, alpha: 0.75 });
    }
    if (walkable(at(x, 10)) && walkable(at(x, 8)) && materialAt(x, 10, l.materials) === 'concrete' && x % 2 === 0) g.rect(x, 10.47, 0.6, 0.06).fill({ color: 0xc9bf9e, alpha: 0.22 });
  }

  // 3. Grime: dark blobs, denser along walls; a few cracks and oil stains.
  for (let k = 0; k < 260; k++) {
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
    if (!walkable(at(x, y))) continue;
    const nearWall = at(x - 1, y) === WALL || at(x + 1, y) === WALL || at(x, y - 1) === WALL || at(x, y + 1) === WALL;
    if (!nearWall && rnd() < 0.6) continue;
    const r = 0.15 + rnd() * 0.45;
    g.ellipse(x + rnd(), y + rnd(), r, r * (0.5 + rnd() * 0.5)).fill({ color: 0x14110c, alpha: 0.08 + rnd() * 0.1 });
  }
  for (let k = 0; k < 40; k++) {
    let x = 1 + rnd() * (w - 2), y = 1 + rnd() * (h - 2);
    if (!walkable(at(Math.floor(x), Math.floor(y)))) continue;
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (rnd() - 0.5) * 0.7;
      y += (rnd() - 0.5) * 0.7;
      g.lineTo(x, y);
    }
    g.stroke({ width: 0.025, color: 0x1a1712, alpha: 0.35 });
  }

  // 4. Drop shadows (light from the north-west): walls and cover cast onto the floor south-east.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y * w + x];
      if (t === WALL) {
        if (walkable(at(x + 1, y)) || at(x + 1, y) === COVER) g.rect(x + 1, y + 0.1, 0.28, 1).fill({ color: 0x000000, alpha: 0.32 });
        if (walkable(at(x, y + 1)) || at(x, y + 1) === COVER) g.rect(x + 0.1, y + 1, 1, 0.45).fill({ color: 0x000000, alpha: 0.38 });
      } else if (t === COVER || t === BARRIER) {
        g.rect(x + 0.2, y + 0.25, 0.95, 0.95).fill({ color: 0x000000, alpha: 0.3 });
      }
    }
  }

  // 5. Walls: dark top, a lit rim on every edge that faces floor, and a darker south face for height.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y * w + x] !== WALL) continue;
      g.rect(x, y, 1, 1).fill(MAT.wallTop);
      if ((x * 7 + y * 13) % 5 === 0) g.rect(x + 0.1, y + 0.1, 0.8, 0.8).fill({ color: 0xffffff, alpha: 0.025 });
      const open = (t: number) => t !== WALL;
      if (open(at(x, y + 1))) g.rect(x, y + 0.72, 1, 0.28).fill(MAT.wallFace).rect(x, y + 0.69, 1, 0.05).fill(MAT.wallRim);
      if (open(at(x, y - 1))) g.rect(x, y, 1, 0.06).fill(MAT.wallRim);
      if (open(at(x - 1, y))) g.rect(x, y, 0.06, 1).fill({ color: MAT.wallRim, alpha: 0.85 });
      if (open(at(x + 1, y))) g.rect(x + 0.94, y, 0.06, 1).fill({ color: MAT.wallRim, alpha: 0.6 });
    }
  }

  // 6. Doorways: frame posts on the wall sides and a worn threshold.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (tiles[y * w + x] !== DOOR) continue;
      const vertical = at(x, y - 1) === WALL && at(x, y + 1) === WALL;
      if (vertical) {
        g.rect(x + 0.35, y, 0.3, 1).fill({ color: 0x000000, alpha: 0.18 });
        g.rect(x + 0.3, y - 0.12, 0.4, 0.14).fill(MAT.door).rect(x + 0.3, y + 0.98, 0.4, 0.14).fill(MAT.door);
      } else {
        g.rect(x, y + 0.35, 1, 0.3).fill({ color: 0x000000, alpha: 0.18 });
        g.rect(x - 0.12, y + 0.3, 0.14, 0.4).fill(MAT.door).rect(x + 0.98, y + 0.3, 0.14, 0.4).fill(MAT.door);
      }
    }
  }

  // 7. Cover: crates (wood, lid, braces) and barriers (concrete, hazard stripes).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y * w + x];
      if (t === COVER) {
        // Fills the collision tile (footprint.ts): wood box, lid, cross braces.
        const d = coverDrawBox('crate', x, y);
        g.rect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0).fill(MAT.crateEdge);
        g.rect(x + 0.07, y + 0.07, 0.86, 0.86).fill(MAT.crate);
        g.rect(x + 0.16, y + 0.14, 0.68, 0.64).fill(MAT.crateLid);
        g.moveTo(x + 0.16, y + 0.14).lineTo(x + 0.84, y + 0.78).moveTo(x + 0.84, y + 0.14).lineTo(x + 0.16, y + 0.78)
          .stroke({ width: 0.05, color: MAT.crateEdge, alpha: 0.7 });
        g.rect(x + 0.07, y + 0.8, 0.86, 0.13).fill({ color: 0x000000, alpha: 0.25 });
      } else if (t === BARRIER) {
        // Concrete block filling the collision tile, hazard stripes on the top face.
        const d = coverDrawBox('barrier', x, y);
        g.rect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0).fill(MAT.barrierEdge);
        g.rect(x + 0.07, y + 0.07, 0.86, 0.72).fill(MAT.barrier);
        for (let k = 0; k < 3; k++) g.poly([x + 0.1 + k * 0.3, y + 0.1, x + 0.25 + k * 0.3, y + 0.1, x + 0.12 + k * 0.3, y + 0.76, x - 0.03 + k * 0.3, y + 0.76]).fill({ color: MAT.stripe, alpha: 0.8 });
        g.rect(x + 0.07, y + 0.79, 0.86, 0.14).fill({ color: 0x000000, alpha: 0.28 });
      }
    }
  }
}

export interface Baked {
  lit: Texture;
  dim: Texture;
  ppu: number;
}

export function bakeMap(renderer: PixiRenderer, l: Level): Baked {
  const ppu = TUNING.render.bakePpu;
  const holder = new Container();
  const g = new Graphics();
  holder.addChild(g);
  holder.scale.set(ppu);
  drawMap(g, l);
  const lit = RenderTexture.create({ width: l.w * ppu, height: l.h * ppu, antialias: true });
  renderer.render({ container: holder, target: lit });

  // Dim (remembered / out of the light): cool slate ambient that keeps the value order floor > cover > wall,
  // so doors, cover and pickups stay legible (docs/design/art-direction.md). Out of sight but never pitch black.
  // Done once on the CPU from the lit pixels (no runtime filter, nothing for Pixi's texture pool to prune).
  const canvas = renderer.extract.canvas({ target: lit }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  // CF-E: much darker (TUNING.render.dimStructure / dimAmbient): out of the light you keep the walls' rims and the
  // doors, not the floor detail. LAB.dark off: the RC-8 values (0.5 over 14, 20, 26).
  const k = LAB.dark ? TUNING.render.dimStructure : 0.5, keep = 0.3;
  const [ar, ag, ab] = LAB.dark ? TUNING.render.dimAmbient : [14, 20, 26];
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Ambient floor + scaled, cooled structure.
    d[i] = Math.min(255, ar + k * 0.86 * (keep * d[i] + (1 - keep) * L));
    d[i + 1] = Math.min(255, ag + k * 0.97 * (keep * d[i + 1] + (1 - keep) * L));
    d[i + 2] = Math.min(255, ab + k * 1.12 * (keep * d[i + 2] + (1 - keep) * L));
  }
  ctx.putImageData(img, 0, 0);
  if (LAB.dark) {
    // The remembered outline: every wall edge as a thin cool line, so the room's shape survives the dark.
    ctx.strokeStyle = 'rgba(122, 134, 148, 0.55)';
    ctx.lineWidth = Math.max(1, ppu * 0.06);
    ctx.beginPath();
    for (const sg of l.segments) { ctx.moveTo(sg.ax * ppu, sg.ay * ppu); ctx.lineTo(sg.bx * ppu, sg.by * ppu); }
    ctx.stroke();
  }
  const dim = Texture.from(canvas);
  g.destroy();
  return { lit, dim, ppu };
}
