import type { StageProject } from '../composition/types';
import type { BrowserRenderOptions, ExportPhase } from './browser';
export type ExportStatus =
  | 'idle'
  | ExportPhase
  | 'ready'
  | 'cancelled'
  | 'error';
export interface ExportDownload {
  url: string;
  filename: string;
  blob: Blob;
}
export interface ExportState {
  status: ExportStatus;
  progress: number;
  error: string | null;
  download: ExportDownload | null;
}
export const initialExportState: ExportState = {
  status: 'idle',
  progress: 0,
  error: null,
  download: null,
};
export interface ExportDependencies {
  render?: (
    project: StageProject,
    options: BrowserRenderOptions,
  ) => Promise<Blob>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}
export function videoFilename(name: string): string {
  const stem =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64)
      .replace(/-+$/g, '') || 'showcase';
  return `${stem}-pocket-stage-1080p.mp4`;
}

/** Owns only export state and resources; never mutates or restores the editable project. */
export class ExportController {
  private state: ExportState = initialExportState;
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private revision = 0;
  private disposed = false;
  private readonly render: NonNullable<ExportDependencies['render']>;
  private readonly createUrl: NonNullable<ExportDependencies['createUrl']>;
  private readonly revokeUrl: NonNullable<ExportDependencies['revokeUrl']>;
  constructor(deps: ExportDependencies = {}) {
    this.render =
      deps.render ??
      (async (project, options) =>
        (await import('./browser')).renderBrowserVideo(project, options));
    this.createUrl = deps.createUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeUrl = deps.revokeUrl ?? ((url) => URL.revokeObjectURL(url));
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(patch: Partial<ExportState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private releaseDownload() {
    if (this.state.download) this.revokeUrl(this.state.download.url);
  }
  private stop() {
    ++this.revision;
    this.active?.abort();
    this.active = null;
    this.releaseDownload();
  }
  start = async (
    project: StageProject,
    assets?: ReadonlyMap<string, Blob>,
  ): Promise<void> => {
    if (this.disposed) return;
    this.stop();
    const token = this.revision;
    const abort = new AbortController();
    this.active = abort;
    this.emit({
      status: 'preparing',
      progress: 0,
      error: null,
      download: null,
    });
    const current = () =>
      !this.disposed && token === this.revision && !abort.signal.aborted;
    try {
      // Capture before the first await, including the image map (Blob bytes are immutable).
      const snapshot = structuredClone(project);
      const bytes = assets && new Map(assets);
      const filename = videoFilename(snapshot.name);
      const blob = await this.render(snapshot, {
        assets: bytes,
        signal: abort.signal,
        onPhase: (status) => {
          if (current()) this.emit({ status });
        },
        onProgress: (progress) => {
          if (current() && Number.isFinite(progress))
            this.emit({
              status: 'rendering',
              progress: Math.max(
                this.state.progress,
                Math.min(1, Math.max(0, progress)),
              ),
            });
        },
      });
      if (!current()) return;
      if (
        !(blob instanceof Blob) ||
        !blob.size ||
        blob.type.toLowerCase() !== 'video/mp4'
      )
        throw new Error(
          'The renderer did not produce a complete MP4. Try exporting again.',
        );
      const url = this.createUrl(blob);
      this.emit({
        status: 'ready',
        progress: 1,
        download: { url, filename, blob },
        error: null,
      });
    } catch (error) {
      if (current())
        this.emit({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Video export failed. Try again.',
          download: null,
        });
    } finally {
      if (token === this.revision) this.active = null;
    }
  };
  cancel = () => {
    if (!this.active || this.disposed) return;
    this.stop();
    this.emit({
      status: 'cancelled',
      progress: 0,
      error: null,
      download: null,
    });
  };
  reset = () => {
    if (this.disposed) return;
    this.stop();
    this.emit(initialExportState);
  };
  dispose = () => {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.listeners.clear();
  };
}
