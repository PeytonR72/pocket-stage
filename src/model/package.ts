import { normalizeImage } from '../assets/images';
import {
  SLOTS,
  object,
  validateDocument,
  validateSnapshot,
  type AssetRecord,
  type ProjectSnapshot,
} from './project';
// Three 32 MiB normalized assets, base64 expansion, and JSON metadata.
export const MAX_PACKAGE_BYTES = 132 * 1024 * 1024;
export type ImageDecoder = (
  blob: Blob,
  name: string,
  options?: { imported?: boolean },
) => Promise<AssetRecord>;
export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error('Could not read the screenshot bytes.'));
    reader.readAsDataURL(blob);
  });
}
export async function createPackage(snapshot: ProjectSnapshot): Promise<Blob> {
  validateSnapshot(snapshot);
  const byId = new Map(snapshot.assets.map((a) => [a.id, a]));
  const assets: Record<string, unknown> = {};
  for (const slot of SLOTS) {
    const id = snapshot.document.assets[slot];
    if (id) {
      const { blob, ...asset } = byId.get(id)!;
      assets[slot] = { ...asset, src: await blobDataUrl(blob) };
    }
  }
  return new Blob([JSON.stringify({ ...snapshot.document, assets }, null, 2)], {
    type: 'application/json',
  });
}
export async function parsePackage(
  file: Blob,
  decode: ImageDecoder = normalizeImage,
): Promise<ProjectSnapshot> {
  if (file.size > MAX_PACKAGE_BYTES)
    throw new Error('Project packages must be 132 MB or smaller.');
  let input: Record<string, unknown>;
  try {
    input = object(JSON.parse(await file.text()));
  } catch {
    throw new Error('Choose a valid Pocket Stage project JSON package.');
  }
  const rawAssets = object(input.assets);
  const refs: Record<string, string> = {};
  const candidates: {
    slot: (typeof SLOTS)[number];
    id: string;
    name: string;
    data: string;
    width: number;
    height: number;
  }[] = [];
  for (const slot of SLOTS) {
    if (rawAssets[slot] === undefined && slot !== 'main') continue;
    const a = object(rawAssets[slot]);
    if (
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      a.name.length > 200 ||
      typeof a.src !== 'string' ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(
        a.src,
      ) ||
      !Number.isInteger(a.width) ||
      !Number.isInteger(a.height) ||
      (a.width as number) < 1 ||
      (a.height as number) < 1
    )
      throw new Error(`The ${slot} embedded screenshot is invalid.`);
    refs[slot] = a.id;
    candidates.push({
      slot,
      id: a.id,
      name: a.name,
      data: a.src,
      width: a.width as number,
      height: a.height as number,
    });
  }
  const document = validateDocument({ ...input, assets: refs });
  const assets: AssetRecord[] = [];
  for (const c of candidates) {
    const [header, data] = c.data.split(',');
    if (data.length > 45 * 1024 * 1024 || data.length % 4 !== 0)
      throw new Error('The embedded screenshot encoding is invalid.');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    } catch {
      throw new Error('The embedded screenshot encoding is invalid.');
    }
    const record = await decode(
      new Blob([bytes.buffer as ArrayBuffer], { type: header.slice(5, -7) }),
      c.name,
      { imported: true },
    );
    if (record.width !== c.width || record.height !== c.height)
      throw new Error(
        'The embedded screenshot dimensions do not match its image.',
      );
    assets.push({ ...record, id: c.id });
  }
  return validateSnapshot({ document, assets });
}
