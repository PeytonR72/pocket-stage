import { validateSnapshot, type ProjectSnapshot } from '../model/project';
export interface ProjectStore {
  load(): Promise<ProjectSnapshot | null>;
  save(snapshot: ProjectSnapshot): Promise<void>;
}
export class IndexedProjectStore implements ProjectStore {
  constructor(private readonly name = 'pocket-stage-v1') {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('project');
        request.result.createObjectStore('assets', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error || new Error('Could not open local project storage.'),
        );
      request.onblocked = () =>
        reject(
          new Error(
            'Local storage is blocked by another open tab. Close it and try again.',
          ),
        );
    });
  }
  async load(): Promise<ProjectSnapshot | null> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['project', 'assets'], 'readonly');
        const doc = tx.objectStore('project').get('current');
        const assets = tx.objectStore('assets').getAll();
        tx.oncomplete = () => {
          try {
            resolve(
              doc.result
                ? validateSnapshot({
                    document: doc.result,
                    assets: assets.result,
                  })
                : null,
            );
          } catch (e) {
            reject(e);
          }
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || new Error('Local storage read was interrupted.'));
      });
    } finally {
      db.close();
    }
  }
  async save(snapshot: ProjectSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot);
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['project', 'assets'], 'readwrite');
        tx.objectStore('project').put(valid.document, 'current');
        const assets = tx.objectStore('assets');
        assets.clear();
        for (const asset of valid.assets) assets.put(asset);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || new Error('Local storage write was interrupted.'));
      });
    } finally {
      db.close();
    }
  }
}
