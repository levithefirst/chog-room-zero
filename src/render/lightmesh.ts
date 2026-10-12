// One-pass light: a textured triangle mesh over the visibility polygon with per-vertex alpha.
// It blends the lit bake over the dim bake (premultiplied), so light falloff = blend amount. No stencil masks,
// no full-screen sprites (P3 audit: two masked layers were the dominant fill cost).
import { Geometry, GlProgram, Mesh, Shader, type Texture } from 'pixi.js';
import { angleDiff } from '../sim/geom';

const vertex = `in vec2 aPosition;
in vec2 aUV;
in float aAlpha;
out vec2 vUV;
out float vAlpha;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vAlpha = aAlpha;
}`;
const fragment = `in vec2 vUV;
in float vAlpha;
uniform sampler2D uTexture;
uniform vec3 uTint;
out vec4 finalColor;
void main() {
  vec4 c = texture(uTexture, vUV);
  finalColor = vec4(c.rgb * uTint, c.a) * vAlpha;
}`;

/** Radial sample fractions from the viewer to each outline point. */
const RINGS = [0.08, 0.16, 0.3, 0.45, 0.6, 0.75, 0.87, 1];
const MAX_POINTS = 720;

export interface LightParams {
  x: number; y: number; facing: number;
  range: number; coneRad: number; nearRadius: number;
  /** Lateral soft edge inside the cone, radians. */
  edgeRad: number;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Light amount (0..1 blend of lit over dim) at a point, from distance d and angle offset da (docs/design/art-direction.md).
 * Cone: full to 15% of range, eases to 45% by 85%, then a soft lip to 0 at the range end. Lateral feather over edgeRad.
 * Halo: 0.75 near the body, gone by the near radius.
 */
export function lightAt(d: number, da: number, L: LightParams): number {
  const u = d / L.range;
  const half = L.coneRad / 2;
  const cone = (1 - 0.55 * smooth(0.15, 0.85, u)) * (1 - smooth(0.85, 1, u)) * (1 - smooth(half - L.edgeRad, half, Math.abs(da)));
  const halo = 0.75 * (1 - smooth(L.nearRadius * 0.35, L.nearRadius, d));
  return Math.max(Math.abs(da) <= half ? cone : 0, halo);
}

export interface LightMesh {
  mesh: Mesh<Geometry, Shader>;
  /** Rebuild from the visibility polygon (flat x,y outline, star-shaped around the viewer). */
  update(poly: readonly number[], L: LightParams): void;
  setTexture(t: Texture, worldW: number, worldH: number): void;
}

export function createLightMesh(tex: Texture, worldW: number, worldH: number, tint: [number, number, number]): LightMesh {
  const nv = 1 + MAX_POINTS * RINGS.length;
  const pos = new Float32Array(nv * 2);
  const uv = new Float32Array(nv * 2);
  const alpha = new Float32Array(nv);
  const quadsPerSeg = 1 + (RINGS.length - 1) * 2; // 1 fan triangle + 2 per ring band
  const idx = new Uint32Array(MAX_POINTS * quadsPerSeg * 3);
  const geometry = new Geometry({
    attributes: { aPosition: { buffer: pos, format: 'float32x2' }, aUV: { buffer: uv, format: 'float32x2' }, aAlpha: { buffer: alpha, format: 'float32' } },
    indexBuffer: idx,
  });
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'chog-light' }),
    resources: { uTexture: tex.source, lightUniforms: { uTint: { value: new Float32Array(tint), type: 'vec3<f32>' } } },
  });
  const mesh = new Mesh({ geometry, shader });
  let W = worldW, H = worldH;
  const posBuf = geometry.getAttribute('aPosition').buffer;
  const uvBuf = geometry.getAttribute('aUV').buffer;
  const aBuf = geometry.getAttribute('aAlpha').buffer;
  const iBuf = geometry.indexBuffer;

  return {
    mesh,
    setTexture(t, ww, hh) {
      shader.resources.uTexture = t.source;
      W = ww; H = hh;
    },
    update(poly, L) {
      const n = Math.min(MAX_POINTS, poly.length >> 1);
      const R = RINGS.length;
      pos[0] = L.x; pos[1] = L.y; uv[0] = L.x / W; uv[1] = L.y / H; alpha[0] = lightAt(0, 0, L);
      for (let i = 0; i < n; i++) {
        const ex = poly[i * 2], ey = poly[i * 2 + 1];
        const dx = ex - L.x, dy = ey - L.y;
        const dEnd = Math.hypot(dx, dy);
        const da = angleDiff(L.facing, Math.atan2(dy, dx));
        for (let k = 0; k < R; k++) {
          const f = RINGS[k];
          const v = 1 + i * R + k;
          const x = L.x + dx * f, y = L.y + dy * f;
          pos[v * 2] = x; pos[v * 2 + 1] = y;
          uv[v * 2] = x / W; uv[v * 2 + 1] = y / H;
          alpha[v] = lightAt(dEnd * f, da, L);
        }
      }
      let o = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a0 = 1 + i * R, b0 = 1 + j * R;
        idx[o++] = 0; idx[o++] = a0; idx[o++] = b0;
        for (let k = 0; k < R - 1; k++) {
          idx[o++] = a0 + k; idx[o++] = a0 + k + 1; idx[o++] = b0 + k;
          idx[o++] = b0 + k; idx[o++] = a0 + k + 1; idx[o++] = b0 + k + 1;
        }
      }
      idx.fill(0, o);
      posBuf.update(); uvBuf.update(); aBuf.update(); iBuf.update();
    },
  };
}
