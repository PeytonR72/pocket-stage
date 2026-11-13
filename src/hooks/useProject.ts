import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetSlot } from '../composition/types';
import {
  ProjectController,
  type ProjectState,
} from '../model/ProjectController';
import { sampleProject } from '../composition/types';
import type { ProjectFields } from '../model/project';
export function useProject() {
  const controller = useRef<ProjectController | null>(null);
  const [state, setState] = useState<ProjectState>({
    project: sampleProject,
    ready: false,
    saveStatus: 'loading',
    error: null,
  });
  useEffect(() => {
    const c = new ProjectController();
    controller.current = c;
    const off = c.subscribe(() => setState(c.getState()));
    void c.start();
    return () => {
      off();
      c.dispose();
      if (controller.current === c) controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.pruneUrls();
  }, [state.project]);
  const update = useCallback(
    (fields: ProjectFields) => controller.current?.update(fields),
    [],
  );
  const replaceAsset = useCallback(
    (slot: AssetSlot, file: File) =>
      controller.current?.replaceAsset(slot, file) || Promise.resolve(false),
    [],
  );
  const clearAsset = useCallback(
    (slot: 'detail' | 'extra') => controller.current?.clearAsset(slot),
    [],
  );
  const importPackage = useCallback(
    (file: File) =>
      controller.current?.importPackage(file) || Promise.resolve(false),
    [],
  );
  const exportPackage = useCallback(() => {
    if (!controller.current)
      return Promise.reject(new Error('The project is still opening.'));
    return controller.current.exportPackage();
  }, []);
  const captureForExport = useCallback(() => {
    if (!controller.current) throw new Error('The project is still opening.');
    return controller.current.captureForExport();
  }, []);
  const dismissError = useCallback(
    () => controller.current?.dismissError(),
    [],
  );
  return {
    ...state,
    update,
    replaceAsset,
    clearAsset,
    importPackage,
    exportPackage,
    captureForExport,
    dismissError,
  };
}
