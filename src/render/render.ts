import { Application, Graphics } from 'pixi.js';
import { TUNING } from '../config/tuning';
import type { PlayerState } from '../sim/sim';

export interface Renderer {
  app: Application;
  draw(player: PlayerState): void;
}

export async function createRenderer(parent: HTMLElement): Promise<Renderer> {
  const R = TUNING.render;
  const app = new Application();
  await app.init({
    background: R.backgroundColor,
    resizeTo: parent,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  parent.appendChild(app.canvas);

  // Placeholder player marker. Sim origin (0,0) is the screen centre.
  const marker = new Graphics().circle(0, 0, R.markerRadius).fill(R.markerColor);
  app.stage.addChild(marker);

  const wrap = (v: number, size: number) => ((v % size) + size) % size;

  return {
    app,
    draw(p) {
      const w = app.screen.width;
      const h = app.screen.height;
      // Wrap around the screen edges: presentation only, the sim is unbounded for now.
      marker.position.set(
        wrap(w / 2 + p.x * R.pixelsPerUnit, w),
        wrap(h / 2 + p.y * R.pixelsPerUnit, h),
      );
    },
  };
}
