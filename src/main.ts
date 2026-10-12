import { createRenderer, type Fx } from './render/render';
import { createInput } from './input/input';
import { createAudio } from './audio/audio';
import { fixedSteps } from './sim/sim';
import { createWorld, hears, player, stepWorld, viewOf, type World } from './sim/world';
import { sightClear } from './sim/level';
import { canSee } from './sim/vision';
import { TUNING } from './config/tuning';
import { adapterFromUrl, resolveIdentity, GUEST, type Identity } from './nft/identity';
import { recordRun, type TokenHistory } from './nft/history';

const $ = (id: string) => document.getElementById(id)!;
const root = $('app');
const overlay = $('overlay');
const hint = $('hint');

type Phase = 'title' | 'play' | 'recap' | 'summary';

function compass(dx: number, dy: number): string {
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const i = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[i];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

async function start() {
  const renderer = await createRenderer(root);
  const input = createInput(root);
  const audio = createAudio();
  const { identity: id, note } = await resolveIdentity(adapterFromUrl(location.search)).catch(() => ({ identity: GUEST, note: 'Playing as guest.' }));
  const identity: Identity = id;

  let phase: Phase = 'title';
  let runIndex = 0;
  let world: World = createWorld({ seed: TUNING.seed, playerOp: identity.operator });
  let acc = 0;
  let recapLeft = 0;
  let playTime = 0;
  let history: TokenHistory | null = null;
  const fx: Fx = { markers: [], impacts: [], hitMarks: [], shake: 0, corpses: [] };
  renderer.reset(world);

  $('op').textContent = identity.kind === 'bound' ? `${identity.label} / ${identity.operator.name}${identity.source === 'mock' ? ' (mock)' : ''}` : 'Guest / Standard';
  const mute = $('mute') as HTMLButtonElement;
  mute.onclick = () => {
    audio.muted = !audio.muted;
    mute.textContent = audio.muted ? 'Sound off' : 'Sound on';
  };
  ($('reload') as HTMLButtonElement).onpointerdown = (e) => {
    e.stopPropagation();
    input.reload();
  };

  function showTitle() {
    overlay.className = 'layer';
    overlay.innerHTML = `<div class="card">
      <h1>CHOG: ROOM ZERO</h1>
      <p>One room. Five hostiles. No light but yours.</p>
      <p>Walls stop sight and bullets. Running is loud. Shots are louder.</p>
      <p>${esc(note)}</p>
      <p class="go">${input.mode === 'touch' ? 'Tap to enter. Turn the phone sideways.' : 'Click to enter.'}</p></div>`;
  }

  function begin() {
    audio.unlock();
    runIndex++;
    world = createWorld({ seed: TUNING.seed + runIndex, playerOp: identity.operator });
    renderer.reset(world);
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = 0;
    fx.shake = 0;
    acc = 0;
    playTime = 0;
    history = null;
    phase = 'play';
    overlay.className = 'layer hidden';
    // First-30-seconds teaching: one line of controls that fades out.
    hint.innerHTML = input.mode === 'touch'
      ? 'Left thumb moves. Half push creeps.<br>Right thumb aims. Push past the ring to fire.'
      : 'WASD move. Shift creeps.<br>Mouse aims. Click fires. R reloads.';
    hint.style.opacity = runIndex === 1 ? '1' : '0';
  }

  function endRun(won: boolean) {
    const p = player(world);
    const r = { won, seconds: Math.round(playTime), kills: p.kills, shots: p.shots, hits: p.hits, at: new Date().toISOString() };
    history = recordRun(localStorage, identity.tokenId, r);
  }

  function showRecap() {
    const k = world.playerKill!;
    const killer = world.actors[k.killerId];
    const p = player(world);
    const d = Math.hypot(k.fromX - p.x, k.fromY - p.y);
    overlay.className = 'layer clear';
    overlay.innerHTML = `<div class="card"><h2 class="bad">DOWN</h2><p>Shot by ${esc(killer.name)} from ${d.toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p></div>`;
  }

  function showSummary(won: boolean) {
    const p = player(world);
    const acc = p.shots ? Math.round((p.hits / p.shots) * 100) : 0;
    const left = world.actors.filter((a) => a.team === 'bot' && a.alive).length;
    const k = world.playerKill;
    const why = !won && k ? `<p class="bad">Shot by ${esc(world.actors[k.killerId].name)}, ${Math.hypot(k.fromX - p.x, k.fromY - p.y).toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>` : '';
    const hist = history
      ? `<p>${esc(identity.label)} history (this device): ${history.runs} runs, ${history.wins} cleared, ${history.kills} kills${history.bestWinSeconds !== null ? `, best clear ${history.bestWinSeconds} s` : ''}.</p>`
      : '<p>Guest run. Nothing was saved.</p>';
    overlay.className = 'layer';
    overlay.innerHTML = `<div class="card"><h2${won ? '' : ' class="bad"'}>${won ? 'ROOM CLEARED' : 'RUN OVER'}</h2>${why}
      <table><tr><td>Time</td><td>${Math.round(playTime)} s</td></tr>
      <tr><td>Hostiles down</td><td>${p.kills} of ${world.actors.length - 1}${won ? '' : `, ${left} left`}</td></tr>
      <tr><td>Hits / shots</td><td>${p.hits} / ${p.shots} (${acc}%)</td></tr></table>${hist}
      <p class="go">${input.mode === 'touch' ? 'Tap to go again.' : 'R or click to go again.'}</p></div>`;
  }

  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'touch') input.mode = 'touch';
    if (phase === 'title' || phase === 'summary') begin();
  });

  showTitle();

  // Per-step presentation: sounds go to audio and heard markers, hits go to feedback.
  function afterStep() {
    const p = player(world);
    const view = viewOf(p);
    for (const s of world.sounds) {
      const own = s.sourceId === 0;
      const dx = s.x - p.x, dy = s.y - p.y;
      const heard = own || hears(world.level, p.x, p.y, s);
      if (!heard) continue;
      audio.play(s.type, dx, dy, s.radius, !own && !sightClear(world.level, p.x, p.y, s.x, s.y), own);
      if (s.type === 'impact') fx.impacts.push({ x: s.x, y: s.y, age: 0 });
      if (own || s.team !== 'bot') continue;
      const src = world.actors[s.sourceId];
      if (src.alive && canSee(world.level, p.x, p.y, p.facing, view, src.x, src.y)) continue;
      // Heard, not seen: mark the rough area. Further away means a looser guess.
      const err = Math.hypot(dx, dy) * 0.08;
      fx.markers.push({ x: s.x + (Math.random() * 2 - 1) * err, y: s.y + (Math.random() * 2 - 1) * err, age: 0, life: TUNING.sound.markerLife, big: s.type === 'shot' || s.type === 'death' });
    }
    for (const h of world.hits) {
      if (h.by === 0) fx.hitMarks.push({ x: h.x, y: h.y, age: 0, kill: h.killed });
      if (h.target === 0) {
        fx.shake = TUNING.render.shakeSeconds;
        fx.markers.push({ x: h.fromX, y: h.fromY, age: 0, life: 1, big: true });
      }
      if (h.killed) fx.corpses.push({ x: world.actors[h.target].x, y: world.actors[h.target].y, hostile: h.target !== 0 });
    }
  }

  let fpsAcc = 0, fpsFrames = 0;
  // Test hook for the scripted browser run. Only in dev builds or with ?debug in the URL.
  const hook = { fps: 0 } as { fps: number } & Record<string, unknown>;
  if (import.meta.env.DEV || location.search.includes('debug')) {
    Object.defineProperties(hook, {
      world: { get: () => world },
      phase: { get: () => phase },
    });
    Object.assign(hook, { renderer, begin });
    (window as unknown as { __chog: unknown }).__chog = hook;
  }

  renderer.app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 1) {
      hook.fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    document.body.classList.toggle('touch', input.mode === 'touch');
    const action = input.takeAction();

    if (phase === 'play') {
      const p = player(world);
      const ps = renderer.toScreen(p.x, p.y);
      const inp = input.read(ps.x, ps.y);
      const r = fixedSteps(acc, dt, TUNING.simStepSeconds, TUNING.maxStepsPerFrame);
      acc = r.remainder;
      for (let i = 0; i < r.steps && world.outcome === 'playing'; i++) {
        stepWorld(world, inp);
        inp.reload = false;
        afterStep();
        playTime += TUNING.simStepSeconds;
      }
      if (playTime > 12) hint.style.opacity = '0';
      if (world.outcome === 'dead') {
        phase = 'recap';
        recapLeft = TUNING.render.deathFreeze;
        endRun(false);
        showRecap();
      } else if (world.outcome === 'won') {
        phase = 'summary';
        endRun(true);
        showSummary(true);
      }
    } else if (phase === 'recap') {
      recapLeft -= dt;
      if (recapLeft <= 0) {
        phase = 'summary';
        showSummary(false);
      }
    } else if (action) {
      begin();
    }

    // Age presentation effects.
    for (const m of fx.markers) m.age += dt;
    for (const m of fx.impacts) m.age += dt;
    for (const m of fx.hitMarks) m.age += dt;
    fx.markers = fx.markers.filter((m) => m.age < m.life);
    fx.impacts = fx.impacts.filter((m) => m.age < 0.12);
    fx.hitMarks = fx.hitMarks.filter((m) => m.age < 0.15);
    fx.shake = Math.max(0, fx.shake - dt);

    renderer.draw(world, fx, input, dt, { recap: phase === 'recap' || (phase === 'summary' && world.outcome === 'dead'), marking: identity.marking, showSticks: phase === 'play' && input.mode === 'touch', playing: phase === 'play' });

    const p = player(world);
    $('hpn').textContent = String(Math.max(0, p.hp));
    ($('hpfill') as HTMLElement).style.width = `${(p.hp / TUNING.combat.maxHp) * 100}%`;
    $('ammo').innerHTML = p.reloadLeft > 0 ? `--<small>reloading</small>` : `${p.ammo}<small>of ${p.op.magazine}</small>`;
    $('left').textContent = `${world.actors.filter((a) => a.team === 'bot' && a.alive).length} hostiles left`;
    const low = p.alive && p.hp / TUNING.combat.maxHp <= TUNING.render.lowHpShare;
    ($('vignette') as HTMLElement).style.opacity = low ? String(0.5 + 0.5 * (1 - p.hp / (TUNING.combat.maxHp * TUNING.render.lowHpShare))) : '0';
    $('hud').style.visibility = phase === 'title' ? 'hidden' : 'visible';
  });
}

start().catch((err) => {
  console.error('Game failed to start', err);
  overlay.innerHTML = `<div class="card"><p>The game could not start: ${esc(String(err))}. Reload the page to try again.</p></div>`;
});
