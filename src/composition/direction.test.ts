import { describe, expect, it } from 'vitest';
import { sampleProject, VIDEO, type StageAsset } from './types';
import {
  availableAssets,
  cardPose,
  closingPose,
  fitCopy,
  imageCrop,
  projectTextFit,
  SHOTS,
  TEXT_BOUNDS,
} from './direction';

const tall: StageAsset = {
  id: 'tall',
  name: 'Tall',
  src: '/tall.png',
  width: 720,
  height: 1600,
};
const wide: StageAsset = {
  id: 'wide',
  name: 'Wide',
  src: '/wide.png',
  width: 2200,
  height: 1000,
};
const project = {
  ...sampleProject,
  assets: { ...sampleProject.assets, detail: tall, extra: wide },
};
describe('directed sequence', () => {
  it('keeps the fixed three-shot clock inside exactly twelve seconds', () => {
    expect(VIDEO.durationInFrames / VIDEO.fps).toBe(12);
    expect(SHOTS.reveal[1]).toBe(SHOTS.detail[0]);
    expect(SHOTS.detail[1]).toBe(SHOTS.showcase[0]);
    expect(SHOTS.showcase[1]).toBe(VIDEO.durationInFrames);
  });
  it('never loses all assets during source changes or either shot transition', () => {
    for (const fixture of [
      sampleProject,
      { ...project, assets: { main: tall, extra: wide } },
      project,
    ]) {
      const assets = availableAssets(fixture);
      for (let frame = 0; frame < VIDEO.durationInFrames; frame++) {
        const poses = assets.map((asset, i) =>
          cardPose(fixture, asset, i, frame),
        );
        expect(
          poses.reduce((sum, pose) => sum + pose.opacity, 0),
        ).toBeGreaterThanOrEqual(0.999);
        for (const pose of poses)
          expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      }
    }
  });
  it('crosses the shot boundaries continuously, including optional source changes', () => {
    for (const boundary of [108, 120, 138, 170, 228, 240, 282]) {
      availableAssets(project).forEach((asset, i) => {
        const before = cardPose(project, asset, i, boundary - 0.001);
        const after = cardPose(project, asset, i, boundary + 0.001);
        for (const key of Object.keys(before) as (keyof typeof before)[])
          expect(Math.abs(before[key] - after[key])).toBeLessThan(0.1);
      });
    }
  });
  it('random seeks and reverse scrubbing reproduce the same frame without prior playback', () => {
    const frames = [0, 315, 120, 359, 228, 12, 240, 169, 108, 300];
    const baseline = new Map(
      frames.map((frame) => [
        frame,
        availableAssets(project).map((asset, i) =>
          cardPose(project, asset, i, frame),
        ),
      ]),
    );
    for (const frame of [...frames].reverse())
      expect(
        availableAssets(project).map((asset, i) =>
          cardPose(project, asset, i, frame),
        ),
      ).toEqual(baseline.get(frame));
  });
  it('uses each available asset once and holds the final two seconds exactly', () => {
    for (const fixture of [
      sampleProject,
      { ...project, assets: { main: tall, detail: wide } },
      project,
    ]) {
      const assets = availableAssets(fixture);
      expect(new Set(assets.map((asset) => asset.id)).size).toBe(assets.length);
      assets.forEach((asset, i) => {
        const final = closingPose(asset, i, assets.length);
        for (const frame of [299, 300, 315, 359])
          expect(cardPose(fixture, asset, i, frame)).toEqual(final);
        expect(final.width / final.height).toBeCloseTo(
          asset.width / asset.height,
        );
        expect(final.x - final.width / 2).toBeGreaterThan(70);
        expect(final.x + final.width / 2).toBeLessThan(1850);
      });
    }
  });
});
describe('detail framing', () => {
  it('changes the visible source region with the normalized focal point', () => {
    const left = imageCrop(wide, 1000, 760, 1.52, { x: 0, y: 0 });
    const right = imageCrop(wide, 1000, 760, 1.52, { x: 1, y: 1 });
    expect(right.left).toBeGreaterThan(left.left);
    expect(right.top).toBeGreaterThan(left.top);
  });
  it('clamps corners, invalid points, mixed aspect ratios and all transitional crops to the real source', () => {
    for (const asset of [sampleProject.assets.main, tall, wide])
      for (const x of [-1, 0, 0.5, 1, 2, NaN])
        for (const y of [0, 0.5, 1])
          for (const frame of [0, 108, 120, 145, 180, 240, 260, 359]) {
            const pose = cardPose(
              { ...sampleProject, assets: { main: asset } },
              asset,
              0,
              frame,
            );
            const crop = imageCrop(asset, pose.width, pose.height, pose.zoom, {
              x,
              y,
            });
            expect(crop.left).toBeGreaterThanOrEqual(-1e-12);
            expect(crop.top).toBeGreaterThanOrEqual(-1e-12);
            expect(crop.left + crop.width).toBeLessThanOrEqual(1 + 1e-12);
            expect(crop.top + crop.height).toBeLessThanOrEqual(1 + 1e-12);
            expect(
              ((crop.width / crop.height) * asset.width) / asset.height,
            ).toBeCloseTo(pose.width / pose.height);
          }
  });
});
describe('safe copy', () => {
  it('fits maximum ordinary copy and an unbroken URL with explicit line limits', () => {
    const fixture = {
      ...sampleProject,
      name: 'm'.repeat(40),
      openingCaption: 'a'.repeat(64),
      featureCaption: 'a'.repeat(80),
      closingUrl: 'w'.repeat(80),
    };
    expect(projectTextFit(fixture)).toEqual([]);
    for (const field of Object.keys(
      TEXT_BOUNDS,
    ) as (keyof typeof TEXT_BOUNDS)[]) {
      const bounds = TEXT_BOUNDS[field];
      const fit = fitCopy(
        fixture[field],
        bounds.width,
        bounds.preferred,
        bounds.lines,
      );
      expect(fit.fontSize).toBeGreaterThanOrEqual(28);
      expect(fit.lines).toBeLessThanOrEqual(bounds.lines);
    }
  });
  it('handles wide glyphs and reports unfit Unicode instead of pretending it fits', () => {
    expect(projectTextFit({ ...sampleProject, name: 'W'.repeat(40) })).toEqual(
      [],
    );
    for (const name of ['中'.repeat(40), '😀'.repeat(40)])
      expect(projectTextFit({ ...sampleProject, name })[0]?.field).toBe('name');
  });
  it('leaves optional empty copy intentionally empty', () => {
    expect(fitCopy('', 620, 36, 2)).toMatchObject({
      text: '',
      lines: 0,
      fits: true,
    });
  });
});
