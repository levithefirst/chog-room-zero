// Vercel runs api/ as native Node ESM: every runtime relative import reachable from a route must name its .js file.
// Vite and Vitest resolve extensionless imports, so only this test catches one before production does (2026-10-14:
// src/ui/medals.ts imported '../config/heroes' and every /api/game route failed with FUNCTION_INVOCATION_FAILED).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ROOT = join(__dirname, '..');
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : []; });
}

describe('API module graph (native ESM on Vercel)', () => {
  it('every runtime relative import reachable from api/ ends in .js and resolves to a file', () => {
    const seen = new Set<string>(), bad: string[] = [];
    const walk = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)) {
        const spec = m[1];
        const target = normalize(join(dirname(f), spec)).replace(/\.js$/, '.ts');
        if (!spec.endsWith('.js')) bad.push(`${f.slice(ROOT.length + 1)} -> ${spec}`);
        else if (!existsSync(target)) bad.push(`${f.slice(ROOT.length + 1)} -> ${spec} (missing)`);
        if (existsSync(target)) walk(target);
      }
    };
    for (const f of tsFiles(join(ROOT, 'api'))) walk(f);
    expect(seen.size).toBeGreaterThan(15);
    expect(bad).toEqual([]);
  });
});
