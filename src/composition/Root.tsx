import { Composition, registerRoot } from 'remotion';
import { StageComposition } from './StageComposition';
import { sampleProject, VIDEO } from './types';
export const RemotionRoot = () => (
  <Composition
    id="PocketStage"
    component={StageComposition}
    {...VIDEO}
    defaultProps={{ project: sampleProject }}
  />
);
registerRoot(RemotionRoot);
