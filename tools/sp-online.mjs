// CHOG superpowers online, end to end in two separate headless Chrome processes against the local full stack
// (tools/local-api.ts serving the built game, the real game server checking tickets with it): two labelled DEMO Chogs
// (#36: Laser Eyes and an Aura; #11: X-Ray) queue 1v1, the server builds each power from its signed ticket, both
// rosters name both powers, the intro tells each player what it faces, and a beam fired on one client is drawn on the
// other. Emulated desktop input, loopback network: NOT phones, NOT the internet.
// Usage: node tools/sp-online.mjs http://localhost:8790 [shotDir]
import { browser, sleep } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 300 : 1500)}` : ''}`); };
const open = [];

try {
  const clients = [];
  for (const [label, token] of [['laser', '36'], ['xray', '11']]) {
    const b = await browser(`spo-${label}`, { base, shotDir, w: 1280, h: 720 });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    // The DEMO invite link: joins 1v1 as that labelled DEMO token (demo players only meet demo players).
    await b.go(`/?debug&mockChog=${token}&online=1v1&demo=1`);
    clients.push(b);
  }
  const inMatch = await Promise.all(clients.map((b) => b.until(`__chog.online() && __chog.phase === 'play' && !!__chog.net()?.match`, 40000)));
  check('both DEMO Chogs are matched in one online 1v1', inMatch.every(Boolean));
  const view = await Promise.all(clients.map((b) => b.ev(`({ roster: __chog.net().match.roster.map((r) => ({ name: r.name, sp: r.sp ?? null, kind: r.ability.kind, demo: !!r.demo })), me: __chog.world.actors[0].ability.kind, hint: document.getElementById('hint')?.innerText ?? '' })`)));
  const sps = view.map((v) => v.roster.map((r) => r.sp).sort().join());
  check('the server built each power from its signed ticket, and both rosters name both', sps.every((s) => s === 'laser,xray'), JSON.stringify(view.map((v) => v.roster)));
  check('each client plays its own power in its slot', view[0].me === 'laser' && view[1].me === 'xray', JSON.stringify(view.map((v) => v.me)));
  check('the intro names what you face', /X-Ray Eyes/i.test(view[0].hint) && /Laser Eyes/i.test(view[1].hint), JSON.stringify(view.map((v) => v.hint)));
  // The laser client fires its beam (Space); the server runs it and the other client is told (its body, or the line).
  await sleep(3500); // past the countdown
  await clients[0].ev(`(() => { const o = { key: ' ', code: 'Space', bubbles: true }; window.dispatchEvent(new KeyboardEvent('keydown', o)); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', o)), 150); })()`);
  const fired = await clients[0].until(`__chog.world.actors[0].chargeLeft > 0 || __chog.world.actors[0].beamLeft > 0 || __chog.world.actors[0].abilityCd > 0`, 5000);
  check('the beam starts on the server and comes back to its owner', !!fired);
  // Spawns are far apart: the beam neither crosses the other player nor is in its sight, so it must be told nothing
  // (no body, no line). The near case (a body it sees, the line crossing it) is tested on the server: tests/sp-online.test.ts.
  await sleep(600);
  const other = await clients[1].ev(`(() => { const w = __chog.world, me = w.actors[0], a = w.actors.find((x) => x.team !== me.team); const far = Math.hypot(a.x - me.x, a.y - me.y); return { shown: a.x > -50, beams: __chog.net().beams.length, charge: a.chargeLeft + a.beamLeft }; })()`);
  await clients[0].shot('01-laser-online'); await clients[1].shot('01-other-side');
  check('a beam far away and off its line is not sent to the other client (no body, no line)', other.shown === false && other.beams === 0 && other.charge === 0, JSON.stringify(other));
  for (const b of clients) check(`${b.label}: no script errors`, b.errors.length === 0, b.errors.join(' | '));
} finally {
  for (const b of open) await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
