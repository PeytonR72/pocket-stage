import {
  sampleProject,
  type AssetSlot,
  type StageProject,
} from '../composition/types';

export const TEXT_LIMITS = {
  name: 40,
  openingCaption: 64,
  featureCaption: 80,
  closingUrl: 80,
} as const;
export type ProjectFields = Partial<
  Pick<
    StageProject,
    | 'name'
    | 'theme'
    | 'accent'
    | 'openingCaption'
    | 'featureCaption'
    | 'closingUrl'
    | 'focalPoint'
  >
>;
export interface ProjectDocument extends Omit<StageProject, 'assets'> {
  assets: { main: string; detail?: string; extra?: string };
}
export interface AssetRecord {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
}
export interface ProjectSnapshot {
  document: ProjectDocument;
  assets: AssetRecord[];
}
export const SLOTS: AssetSlot[] = ['main', 'detail', 'extra'];
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid project object.');
  return value as Record<string, unknown>;
}
export function validateDocument(value: unknown): ProjectDocument {
  const d = object(value);
  if (d.schemaVersion !== 1)
    throw new Error('This project version is not supported.');
  if (d.layout !== 'landscape')
    throw new Error('Only landscape projects are supported.');
  if (d.theme !== 'midnight' && d.theme !== 'paper')
    throw new Error('Choose Midnight or Paper.');
  if (typeof d.accent !== 'string' || !/^#[a-f\d]{6}$/i.test(d.accent))
    throw new Error('Accent must be a six-digit hex color.');
  const texts = {} as Record<keyof typeof TEXT_LIMITS, string>;
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (typeof d[key] !== 'string' || (d[key] as string).length > max)
      throw new Error(`${key} must be ${max} characters or fewer.`);
    texts[key as keyof typeof TEXT_LIMITS] = d[key] as string;
  }
  const point = object(d.focalPoint);
  if (
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    throw new Error('The focal point must contain finite coordinates.');
  const refs = object(d.assets);
  const assets = {} as ProjectDocument['assets'];
  for (const slot of SLOTS) {
    const id = refs[slot];
    if (id === undefined && slot !== 'main') continue;
    if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id))
      throw new Error(`The ${slot} screenshot reference is invalid.`);
    assets[slot] = id;
  }
  if (new Set(Object.values(assets)).size !== Object.values(assets).length)
    throw new Error('Each screenshot slot needs a unique asset.');
  return {
    schemaVersion: 1,
    ...texts,
    theme: d.theme,
    accent: d.accent,
    layout: 'landscape',
    focalPoint: {
      x: Math.max(0, Math.min(1, point.x)),
      y: Math.max(0, Math.min(1, point.y)),
    },
    assets,
  };
}
export function validateSnapshot(value: ProjectSnapshot): ProjectSnapshot {
  const document = validateDocument(value.document);
  if (
    !Array.isArray(value.assets) ||
    value.assets.length < 1 ||
    value.assets.length > 3
  )
    throw new Error('Projects need one to three screenshots.');
  const ids = new Set<string>();
  for (const a of value.assets) {
    if (
      !a ||
      ids.has(a.id) ||
      !Object.values(document.assets).includes(a.id) ||
      !(a.blob instanceof Blob) ||
      a.blob.size < 1 ||
      a.blob.size > 32 * 1024 * 1024 ||
      a.blob.type !== 'image/png' ||
      !Number.isInteger(a.width) ||
      !Number.isInteger(a.height) ||
      a.width < 1 ||
      a.height < 1 ||
      Math.max(a.width, a.height) > 2560 ||
      typeof a.name !== 'string' ||
      a.name.length > 200
    )
      throw new Error('The saved screenshot data is invalid.');
    ids.add(a.id);
  }
  if (Object.values(document.assets).some((id) => !ids.has(id)))
    throw new Error('A saved screenshot is missing.');
  return { document, assets: value.assets };
}
export function documentFromProject(project: StageProject): ProjectDocument {
  return validateDocument({
    ...project,
    assets: Object.fromEntries(
      SLOTS.filter((s) => project.assets[s]).map((s) => [
        s,
        project.assets[s]!.id,
      ]),
    ),
  });
}
export const sampleDocument = documentFromProject(sampleProject);
