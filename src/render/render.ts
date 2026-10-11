import { Application, Graphics } from 'pixi.js';
import { TUNING } from '../config/tuning';

export async function createRenderer(parent: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    background: TUNING.backgroundColor,
    resizeTo: parent,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  parent.appendChild(app.canvas);

  // One static placeholder shape to prove rendering works.
  const marker = new Graphics().circle(0, 0, TUNING.markerRadius).fill(TUNING.markerColor);
  app.stage.addChild(marker);
  const center = () => marker.position.set(app.screen.width / 2, app.screen.height / 2);
  center();
  app.renderer.on('resize', center);

  return app;
}
