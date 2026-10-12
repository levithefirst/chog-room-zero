// RC-2: repeat the p1ft-e2e ring-hint check N times, each time starting from the state step 3 leaves behind
// (844x390 touch emulation), and running section 4 verbatim from tools/p1ft-e2e.mjs.
// Usage: node tools/p1ft-ring-repeat.mjs <baseUrl> <N> <outJson>
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const [base, n = '20', out = '/tmp/ring.json'] = process.argv.slice(2);
const src = fs.readFileSync(new URL('./p1ft-e2e.mjs', import.meta.url), 'utf8').split('\n');
const header = src.slice(0, src.findIndex((l) => l.startsWith('// 1. ')));
const sec4 = src.slice(src.findIndex((l) => l.startsWith('// 4. ')), src.findIndex((l) => l.startsWith('// 5. ')));
const script = [...header, "await view(844, 390, true); await open(); await play(); // the leaked step-3 state", ...sec4,
  "fs.writeFileSync(outFile, JSON.stringify(results)); chrome.kill(); process.exit(0);"].join('\n');
const tmp = `/tmp/ring-once-${process.pid}.mjs`;
fs.writeFileSync(tmp, script);
const rows = [];
for (let i = 0; i < +n; i++) {
  const o = `/tmp/ring-once-${process.pid}-${i}.json`;
  spawnSync('node', [tmp, base, o], { stdio: 'ignore', timeout: 120000 });
  let r = null; try { r = JSON.parse(fs.readFileSync(o, 'utf8')).find((x) => x.name.startsWith('Ring hint')); } catch {}
  rows.push({ run: i + 1, pass: !!r?.pass });
  console.log(`run ${i + 1}: ${r?.pass ? 'PASS' : 'FAIL'}`);
}
fs.writeFileSync(out, JSON.stringify({ pass: rows.filter((r) => r.pass).length, of: rows.length, rows }, null, 1));
console.log(`ring hint: ${rows.filter((r) => r.pass).length}/${rows.length}`);
