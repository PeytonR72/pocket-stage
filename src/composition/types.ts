export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 360,
} as const;
export type AssetSlot = 'main' | 'detail' | 'extra';
export interface StageAsset {
  id: string;
  src: string;
  width: number;
  height: number;
  name: string;
}
export interface StageProject {
  schemaVersion: 1;
  name: string;
  theme: 'midnight' | 'paper';
  accent: string;
  layout: 'landscape';
  openingCaption: string;
  featureCaption: string;
  closingUrl: string;
  focalPoint: { x: number; y: number };
  assets: { main: StageAsset; detail?: StageAsset; extra?: StageAsset };
}
export interface StageCompositionProps extends Record<string, unknown> {
  project: StageProject;
}
export const sampleProject: StageProject = {
  schemaVersion: 1,
  name: 'Fieldwork',
  theme: 'midnight',
  accent: '#c3e0a1',
  layout: 'landscape',
  openingCaption: 'A little clarity. A lot of possibility.',
  featureCaption: 'Everything in its right place.',
  closingUrl: 'fieldwork.studio',
  focalPoint: { x: 0.59, y: 0.53 },
  assets: {
    main: {
      id: 'sample-main',
      src: '/fixtures/fieldwork.png',
      width: 1440,
      height: 900,
      name: 'Fieldwork — generated UI fixture',
    },
  },
};
