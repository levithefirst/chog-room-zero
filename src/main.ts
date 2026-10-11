import { createRenderer } from './render/render';
import { createInput } from './input/input';

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

createInput();
createRenderer(root).catch((err) => {
  console.error('Renderer failed to start', err);
});
