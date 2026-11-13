import {
  sampleProject,
  type AssetSlot,
  type StageProject,
} from '../composition/types';
import { normalizeImage } from '../assets/images';
import {
  IndexedProjectStore,
  type ProjectStore,
} from '../storage/projectStore';
import { createPackage, parsePackage, type ImageDecoder } from './package';
import {
  sampleDocument,
  SLOTS,
  validateDocument,
  validateSnapshot,
  type ProjectFields,
  type ProjectSnapshot,
} from './project';
export interface ProjectState {
  project: StageProject;
  ready: boolean;
  saveStatus: 'loading' | 'saving' | 'saved' | 'error';
  error: string | null;
}
interface Options {
  store?: ProjectStore;
  decode?: ImageDecoder;
  loadSample?: () => Promise<Blob>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'The project operation failed.';
export class ProjectController {
  private state: ProjectState = {
    project: sampleProject,
    ready: false,
    saveStatus: 'loading',
    error: null,
  };
  private snapshot: ProjectSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly urls = new Map<string, string>();
  private readonly store: ProjectStore;
  private readonly decode: ImageDecoder;
  private readonly loadSample: () => Promise<Blob>;
  private readonly createUrl: (blob: Blob) => string;
  private readonly revokeUrl: (url: string) => void;
  private disposed = false;
  private revision = 0;
  private slotRevision: Record<AssetSlot, number> = {
    main: 0,
    detail: 0,
    extra: 0,
  };
  private wantedSave: ProjectSnapshot | null = null;
  private saving = false;
  private startPromise: Promise<void> | null = null;
  constructor(options: Options = {}) {
    this.store = options.store || new IndexedProjectStore();
    this.decode = options.decode || normalizeImage;
    this.createUrl = options.createUrl || URL.createObjectURL.bind(URL);
    this.revokeUrl = options.revokeUrl || URL.revokeObjectURL.bind(URL);
    this.loadSample =
      options.loadSample ||
      (() =>
        fetch(sampleProject.assets.main.src).then((r) => {
          if (!r.ok)
            throw new Error('The sample screenshot could not be loaded.');
          return r.blob();
        }));
  }
  getState = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit(patch: Partial<ProjectState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  private resolve(snapshot: ProjectSnapshot): StageProject {
    const assets = {} as StageProject['assets'];
    for (const slot of SLOTS) {
      const id = snapshot.document.assets[slot];
      if (!id) continue;
      const a = snapshot.assets.find((a) => a.id === id)!;
      if (!this.urls.has(id)) this.urls.set(id, this.createUrl(a.blob));
      assets[slot] = {
        id,
        src: this.urls.get(id)!,
        width: a.width,
        height: a.height,
        name: a.name,
      };
    }
    return { ...snapshot.document, assets };
  }
  start() {
    if (!this.startPromise) this.startPromise = this.initialize();
    return this.startPromise;
  }
  private async initialize() {
    let loaded: ProjectSnapshot | null = null;
    let loadError: string | null = null;
    try {
      loaded = await this.store.load();
      if (loaded) {
        validateSnapshot(loaded);
        for (const asset of loaded.assets) {
          const decoded = await this.decode(asset.blob, asset.name, {
            imported: true,
          });
          if (decoded.width !== asset.width || decoded.height !== asset.height)
            throw new Error('The saved screenshot dimensions are invalid.');
        }
      }
    } catch (e) {
      loaded = null;
      loadError = `Could not restore the local save: ${message(e)}`;
    }
    try {
      if (!loaded) {
        const main = await this.decode(
          await this.loadSample(),
          sampleProject.assets.main.name,
        );
        loaded = {
          document: { ...sampleDocument, assets: { main: main.id } },
          assets: [main],
        };
      }
      if (this.disposed) return;
      this.snapshot = loaded;
      this.emit({
        project: this.resolve(loaded),
        ready: true,
        error: loadError,
        saveStatus: loadError ? 'error' : 'saved',
      });
      if (!loadError) this.queueSave(loaded);
    } catch (e) {
      this.emit({ ready: false, saveStatus: 'error', error: message(e) });
    }
  }
  private commit(snapshot: ProjectSnapshot) {
    if (this.disposed) return;
    this.snapshot = validateSnapshot(snapshot);
    this.revision++;
    this.emit({ project: this.resolve(snapshot), error: null });
    this.queueSave(snapshot);
  }
  private queueSave(snapshot: ProjectSnapshot) {
    this.wantedSave = snapshot;
    this.emit({ saveStatus: 'saving' });
    void this.drainSaves();
  }
  private async drainSaves() {
    if (this.saving) return;
    this.saving = true;
    while (this.wantedSave && !this.disposed) {
      const next = this.wantedSave;
      this.wantedSave = null;
      try {
        await this.store.save(next);
        if (!this.wantedSave) this.emit({ saveStatus: 'saved' });
      } catch (e) {
        if (!this.wantedSave)
          this.emit({
            saveStatus: 'error',
            error: `Could not save on this device. Your current project is still available. ${message(e)}`,
          });
      }
    }
    this.saving = false;
  }
  private readySnapshot() {
    if (!this.snapshot || !this.state.ready)
      throw new Error('Wait for the project to finish opening.');
    return this.snapshot;
  }
  update = (fields: ProjectFields) => {
    try {
      const s = this.readySnapshot();
      const document = validateDocument({
        ...s.document,
        ...fields,
        assets: s.document.assets,
      });
      this.commit({ ...s, document });
    } catch (e) {
      this.emit({ error: message(e) });
    }
  };
  replaceAsset = async (slot: AssetSlot, file: File): Promise<boolean> => {
    if (!SLOTS.includes(slot)) {
      this.emit({ error: 'Choose a screenshot slot.' });
      return false;
    }
    const token = ++this.slotRevision[slot];
    try {
      this.readySnapshot();
      const asset = await this.decode(file, file.name);
      if (this.disposed || token !== this.slotRevision[slot]) return false;
      const s = this.readySnapshot();
      const oldId = s.document.assets[slot];
      this.commit({
        document: {
          ...s.document,
          assets: { ...s.document.assets, [slot]: asset.id },
        },
        assets: [...s.assets.filter((a) => a.id !== oldId), asset],
      });
      return true;
    } catch (e) {
      if (token === this.slotRevision[slot]) this.emit({ error: message(e) });
      return false;
    }
  };
  clearAsset = (slot: 'detail' | 'extra') => {
    if (slot !== 'detail' && slot !== 'extra') {
      this.emit({ error: 'Main is required and cannot be cleared.' });
      return;
    }
    try {
      const s = this.readySnapshot();
      ++this.slotRevision[slot];
      const id = s.document.assets[slot];
      const assets = { ...s.document.assets };
      delete assets[slot];
      this.commit({
        document: { ...s.document, assets },
        assets: s.assets.filter((a) => a.id !== id),
      });
    } catch (e) {
      this.emit({ error: message(e) });
    }
  };
  captureForExport = () => {
    const s = this.readySnapshot();
    return {
      project: structuredClone(this.state.project),
      assets: new Map(s.assets.map((a) => [a.id, a.blob])) as ReadonlyMap<
        string,
        Blob
      >,
    };
  };
  exportPackage = async () => createPackage(this.readySnapshot());
  importPackage = async (file: File): Promise<boolean> => {
    const revision = this.revision;
    const importToken = ++this.importRevision;
    try {
      this.readySnapshot();
      const snapshot = await parsePackage(file, this.decode);
      if (this.disposed || importToken !== this.importRevision) return false;
      if (revision !== this.revision)
        throw new Error(
          'The project changed while the package was opening. Try opening it again.',
        );
      for (const slot of SLOTS) ++this.slotRevision[slot];
      // Imported IDs may collide with existing IDs; fresh IDs keep URLs tied to immutable bytes.
      const ids = new Map(
        snapshot.assets.map((a) => [a.id, crypto.randomUUID()]),
      );
      const assets = snapshot.assets.map((a) => ({ ...a, id: ids.get(a.id)! }));
      const refs = Object.fromEntries(
        Object.entries(snapshot.document.assets).map(([slot, id]) => [
          slot,
          ids.get(id)!,
        ]),
      ) as ProjectSnapshot['document']['assets'];
      this.commit({ document: { ...snapshot.document, assets: refs }, assets });
      return true;
    } catch (e) {
      if (importToken === this.importRevision) this.emit({ error: message(e) });
      return false;
    }
  };
  private importRevision = 0;
  dismissError = () => this.emit({ error: null });
  /** Call after React commits the new project, so old textures are no longer in the tree. */
  pruneUrls = () => {
    const active = new Set(this.snapshot?.assets.map((a) => a.id) || []);
    for (const [id, url] of this.urls) {
      if (!active.has(id)) {
        this.revokeUrl(url);
        this.urls.delete(id);
      }
    }
  };
  dispose() {
    this.disposed = true;
    for (const url of this.urls.values()) this.revokeUrl(url);
    this.urls.clear();
    this.listeners.clear();
  }
}
