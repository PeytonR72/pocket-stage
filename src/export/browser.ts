import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer';
import { StageComposition } from '../composition/StageComposition';
import { VIDEO, type StageProject } from '../composition/types';
import { projectTextFit } from '../composition/direction';
import {
  abortable,
  createRenderSnapshot,
  throwIfAborted,
  waitForImages,
} from './snapshot';

export const renderSettings = {
  container: 'mp4',
  videoCodec: 'h264',
  muted: true,
  videoBitrate: 'high',
  outputTarget: 'arraybuffer',
} as const;
export const capabilitySettings = {
  ...renderSettings,
  width: VIDEO.width,
  height: VIDEO.height,
} as const;
export type ExportPhase = 'preparing' | 'checking' | 'rendering';
export interface BrowserRenderOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  onPhase?: (phase: ExportPhase) => void;
  assets?: ReadonlyMap<string, Blob>;
  /** Proof harness only; the editor always exports all 360 frames. */
  frameRange?: [number, number];
}
export async function renderBrowserVideo(
  project: StageProject,
  options: BrowserRenderOptions = {},
): Promise<Blob> {
  options.onPhase?.('preparing');
  const snapshot = await createRenderSnapshot(project, options);
  try {
    const textIssues = projectTextFit(snapshot.project);
    if (textIssues.length)
      throw new Error(textIssues.map((issue) => issue.message).join(' '));
    options.onPhase?.('checking');
    const capability = await abortable(
      canRenderMediaOnWeb(capabilitySettings),
      options.signal,
    );
    if (!capability.canRender)
      throw new Error(
        capability.issues.map((issue) => issue.message).join('; ') ||
          'This browser cannot encode the 1080p H.264 video. Try desktop Chrome.',
      );
    options.onPhase?.('preparing');
    await abortable(document.fonts.ready, options.signal);
    await waitForImages(snapshot.project, options.signal);
    throwIfAborted(options.signal);
    options.onPhase?.('rendering');
    // ThreeCanvas gates its Suspense textures and every frame through Remotion's delayRender.
    // The composition also loads its own fonts, so cold renders do not rely on Player playback.
    const result = await renderMediaOnWeb({
      composition: {
        id: 'PocketStage',
        component: StageComposition,
        ...VIDEO,
        defaultProps: { project: snapshot.project },
      },
      inputProps: { project: snapshot.project },
      ...renderSettings,
      signal: options.signal,
      frameRange: options.frameRange,
      onProgress: ({ progress }) => options.onProgress?.(progress),
    });
    const blob = await result.getBlob();
    throwIfAborted(options.signal);
    if (!blob.size)
      throw new Error(
        'The renderer returned an empty video. Try exporting again.',
      );
    return blob;
  } finally {
    snapshot.release();
  }
}
export { canRenderMediaOnWeb };
