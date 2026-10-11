import { createRenderer } from './render/render';
import { createKeyboardInput } from './input/input';
import { createPlayer, fixedSteps, stepPlayer } from './sim/sim';
import { TUNING } from './config/tuning';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

async function start(parent: HTMLElement) {
  const renderer = await createRenderer(parent);
  const input = createKeyboardInput();
  let player = createPlayer();
  let acc = 0;

  renderer.app.ticker.add((ticker) => {
    const r = fixedSteps(acc, ticker.deltaMS / 1000, TUNING.simStepSeconds, TUNING.maxStepsPerFrame);
    acc = r.remainder;
    const move = input.move(); // read once per frame, applied to every step this frame
    for (let i = 0; i < r.steps; i++) {
      player = stepPlayer(player, move, TUNING.simStepSeconds, TUNING.movement);
    }
    renderer.draw(player);
  });
}

start(root).catch((err) => {
  console.error('Game failed to start', err);
});
