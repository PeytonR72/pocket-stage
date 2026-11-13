import type { StageAsset, StageProject } from './types';

export const SHOTS = {
  reveal: [0, 120],
  detail: [120, 240],
  showcase: [240, 360],
} as const;
export const clamp = (n: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
export const ease = (frame: number, start: number, end: number) => {
  const t = clamp((frame - start) / (end - start));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (a: number, b: number, t: number) =>
  t === 0 ? a : t === 1 ? b : a + (b - a) * t;
export interface CardPose {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
  rz: number;
  opacity: number;
  zoom: number;
  z: number;
}
const fit = (asset: StageAsset, maxWidth: number, maxHeight: number) => {
  const scale = Math.min(maxWidth / asset.width, maxHeight / asset.height);
  return { width: asset.width * scale, height: asset.height * scale };
};
const blend = (a: CardPose, b: CardPose, t: number): CardPose =>
  Object.fromEntries(
    Object.keys(a).map((key) => [
      key,
      mix(a[key as keyof CardPose], b[key as keyof CardPose], t),
    ]),
  ) as unknown as CardPose;
export const availableAssets = (project: StageProject) => {
  const seen = new Set<string>();
  return [
    project.assets.main,
    project.assets.detail,
    project.assets.extra,
  ].filter((asset): asset is StageAsset => {
    if (!asset || seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
};
const revealPose = (asset: StageAsset): CardPose => ({
  x: 1280,
  y: 556,
  ...fit(asset, 1000, 760),
  rx: 0.014,
  ry: -0.075,
  rz: -0.012,
  opacity: 1,
  zoom: 1,
  z: 0,
});
const detailPose = (): CardPose => ({
  x: 1300,
  y: 550,
  width: 1000,
  height: 760,
  rx: 0,
  ry: -0.018,
  rz: 0,
  opacity: 1,
  zoom: 1.52,
  z: 5,
});
export const closingPose = (
  asset: StageAsset,
  index: number,
  count: number,
): CardPose => {
  const base = { rx: 0.012, ry: 0, rz: 0, opacity: 1, zoom: 1, z: 0 };
  if (count === 1) return { ...base, x: 960, y: 685, ...fit(asset, 1320, 590) };
  if (count === 2)
    return {
      ...base,
      x: index === 0 ? 555 : 1365,
      y: 680,
      ...fit(asset, 735, 610),
      ry: index === 0 ? -0.045 : 0.045,
    };
  if (index === 0)
    return { ...base, x: 960, y: 674, ...fit(asset, 940, 590), z: 42 };
  return {
    ...base,
    x: index === 1 ? 360 : 1560,
    y: 720,
    ...fit(asset, 535, 460),
    ry: index === 1 ? -0.075 : 0.075,
    rz: index === 1 ? -0.035 : 0.035,
    z: -38,
  };
};
/** Pure frame-to-pose mapping: no playback history, effects, springs, or wall clock. */
export const cardPose = (
  project: StageProject,
  asset: StageAsset,
  index: number,
  frame: number,
): CardPose => {
  const assets = availableAssets(project);
  const main = asset.id === project.assets.main.id;
  const detailAsset = project.assets.detail ?? project.assets.main;
  const detail = asset.id === detailAsset.id;
  const approach = ease(frame, 108, 170);
  const sourceChange = ease(frame, 108, 138);
  const close = ease(frame, 228, 282);
  const start = revealPose(project.assets.main);
  const enter = 1 - ease(frame, 0, 42);
  start.y += enter * 82;
  start.rx += enter * 0.075;
  start.ry -= enter * 0.055;
  start.rz -= enter * 0.025;
  const focus = detailPose();
  let pose = blend(start, focus, approach);
  pose.opacity =
    main && detail ? 1 : main ? 1 - sourceChange : detail ? sourceChange : 0;
  if (!main && !detail)
    pose = {
      ...closingPose(asset, index, assets.length),
      y: closingPose(asset, index, assets.length).y + 60,
      opacity: 0,
    };
  return blend(pose, closingPose(asset, index, assets.length), close);
};
export interface ImageCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Top-left normalized crop, always fully contained in the source. */
export const imageCrop = (
  asset: Pick<StageAsset, 'width' | 'height'>,
  width: number,
  height: number,
  zoom: number,
  focal: { x: number; y: number },
): ImageCrop => {
  const scale =
    Math.max(width / asset.width, height / asset.height) * Math.max(1, zoom);
  const w = clamp(width / (asset.width * scale), 0.0001, 1);
  const h = clamp(height / (asset.height * scale), 0.0001, 1);
  const cx = clamp(focal.x, w / 2, 1 - w / 2);
  const cy = clamp(focal.y, h / 2, 1 - h / 2);
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
};
export const copyVisibility = (frame: number) => ({
  reveal: 1 - ease(frame, 107, 126),
  detail: ease(frame, 122, 141) * (1 - ease(frame, 227, 247)),
  showcase: ease(frame, 244, 265),
});

// Conservative metrics for Manrope plus its Unicode fallbacks. Iterate code points,
// not UTF-16 halves. Explicit lines are identical during preview and export.
const glyphWidth = (char: string) => {
  if (/[mMW@%]/.test(char)) return 1;
  if (char === 'w') return 0.93;
  if (/[ilI.,'!:;| ]/.test(char)) return 0.34;
  if (/[A-Z0-9]/.test(char)) return 0.8;
  if (/[a-z\-_/\\?=&+#()]/.test(char)) return 0.68;
  if (/\p{Mark}/u.test(char)) return 0.15;
  if (/\p{Extended_Pictographic}/u.test(char)) return 1.4;
  return 1.15;
};
const measure = (text: string, size: number) =>
  [...text].reduce((sum, char) => sum + glyphWidth(char) * size, 0);
export const fitCopy = (
  text: string,
  width: number,
  preferred: number,
  maxLines: number,
  minimum = 28,
) => {
  const wrap = (size: number) => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.trim().split(/\s+/)) {
      if (!word) continue;
      if (line && measure(`${line} ${word}`, size) <= width) {
        line += ` ${word}`;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      for (const char of word) {
        if (line && measure(line + char, size) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let size = preferred,
    lines = wrap(size);
  while (lines.length > maxLines && size > minimum) {
    size--;
    lines = wrap(size);
  }
  return {
    fontSize: size,
    text: lines.join('\n'),
    lines: lines.length,
    fits: lines.length <= maxLines,
  };
};
export const TEXT_BOUNDS = {
  name: { width: 620, preferred: 76, lines: 2 },
  openingCaption: { width: 620, preferred: 36, lines: 2 },
  featureCaption: { width: 620, preferred: 48, lines: 3 },
  closingUrl: { width: 1450, preferred: 30, lines: 2 },
} as const;
/** Field-level issues for editor and export. Never silently crop unfit text. */
export const projectTextFit = (
  project: Pick<StageProject, keyof typeof TEXT_BOUNDS>,
) => {
  const labels = {
    name: 'Product name',
    openingCaption: 'Opening caption',
    featureCaption: 'Feature caption',
    closingUrl: 'Display URL',
  };
  return (Object.keys(TEXT_BOUNDS) as (keyof typeof TEXT_BOUNDS)[]).flatMap(
    (field) => {
      const bounds = TEXT_BOUNDS[field],
        result = fitCopy(
          project[field],
          bounds.width,
          bounds.preferred,
          bounds.lines,
        );
      return result.fits
        ? []
        : [
            {
              field,
              message: `${labels[field]} needs shorter text to fit ${bounds.lines} lines at a readable size.`,
            },
          ];
    },
  );
};
