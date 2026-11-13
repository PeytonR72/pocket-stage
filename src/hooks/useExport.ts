import { useCallback, useEffect, useRef, useState } from 'react';
import type { StageProject } from '../composition/types';
import {
  ExportController,
  initialExportState,
  type ExportState,
} from '../export/ExportController';

export function useExport() {
  const controller = useRef<ExportController | null>(null);
  const [state, setState] = useState<ExportState>(initialExportState);
  useEffect(() => {
    const instance = new ExportController();
    controller.current = instance;
    const unsubscribe = instance.subscribe(() => setState(instance.getState()));
    setState(instance.getState());
    return () => {
      unsubscribe();
      instance.dispose();
      if (controller.current === instance) controller.current = null;
    };
  }, []);
  const start = useCallback(
    (project: StageProject, assets?: ReadonlyMap<string, Blob>) =>
      controller.current?.start(project, assets) ?? Promise.resolve(),
    [],
  );
  const cancel = useCallback(() => controller.current?.cancel(), []);
  const reset = useCallback(() => controller.current?.reset(), []);
  return { ...state, start, cancel, reset };
}
