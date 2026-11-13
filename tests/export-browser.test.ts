import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({canRender:vi.fn(), render:vi.fn()}));
vi.mock('@remotion/web-renderer', () => ({canRenderMediaOnWeb:mocks.canRender,renderMediaOnWeb:mocks.render}));
vi.mock('../src/composition/StageComposition', () => ({StageComposition:() => null}));
import {renderBrowserVideo, capabilitySettings, renderSettings} from '../src/export/browser';
import {sampleProject, VIDEO} from '../src/composition/types';
const deferred = <T,>() => {let resolve!:(value:T)=>void; const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};};
let decode:()=>Promise<void>;
let created:ReturnType<typeof vi.spyOn>, revoked:ReturnType<typeof vi.spyOn>;
const bytes=()=>new Map([[sampleProject.assets.main.id,new Blob(['pixels'],{type:'image/png'})]]);
const complete=()=>new Blob(['encoded frames'],{type:'video/mp4'});

beforeEach(() => {
  vi.clearAllMocks(); decode=()=>Promise.resolve();
  vi.stubGlobal('document',{fonts:{ready:Promise.resolve()}});
  vi.stubGlobal('Image',class {src='';naturalWidth=1440;naturalHeight=900;decode(){return decode();}removeAttribute(){this.src='';}});
  created=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:export-owned'); revoked=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  mocks.canRender.mockResolvedValue({canRender:true,issues:[]}); mocks.render.mockResolvedValue({getBlob:async()=>complete()});
});
afterEach(() => {vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('browser render contract', () => {
  it('checks the exact silent high-quality 1080p H.264 configuration used to encode', async () => {
    const phases:string[]=[]; const blob=await renderBrowserVideo(sampleProject,{assets:bytes(),onPhase:p=>phases.push(p)});
    expect(mocks.canRender).toHaveBeenCalledWith({container:'mp4',videoCodec:'h264',videoBitrate:'high',muted:true,outputTarget:'arraybuffer',width:1920,height:1080});
    expect(capabilitySettings).toEqual({...renderSettings,width:VIDEO.width,height:VIDEO.height});
    const config=mocks.render.mock.calls[0][0]; expect(config).toMatchObject({...renderSettings,composition:{...VIDEO,id:'PocketStage'}});
    expect(config.frameRange).toBeUndefined(); expect(config.inputProps.project.assets.main.src).toBe('blob:export-owned');
    expect(phases).toEqual(['preparing','checking','preparing','rendering']); expect(blob.type).toBe('video/mp4'); expect(revoked).toHaveBeenCalledWith('blob:export-owned');
  });

  it('rejects copy that cannot fit the shared composition safe bounds', async () => {
    const project=structuredClone(sampleProject); project.name='界'.repeat(40);
    await expect(renderBrowserVideo(project,{assets:bytes()})).rejects.toThrow();
    expect(mocks.render).not.toHaveBeenCalled(); expect(revoked).toHaveBeenCalledOnce();
  });

  it('waits for both fonts and actual image decoding before entering the renderer', async () => {
    const font=deferred<void>(); const image=deferred<void>(); vi.stubGlobal('document',{fonts:{ready:font.promise}}); decode=()=>image.promise;
    const run=renderBrowserVideo(sampleProject,{assets:bytes()}); await vi.waitFor(()=>expect(mocks.canRender).toHaveBeenCalled());
    expect(mocks.render).not.toHaveBeenCalled(); font.resolve(); await Promise.resolve(); expect(mocks.render).not.toHaveBeenCalled();
    image.resolve(); await run; expect(mocks.render).toHaveBeenCalledOnce();
  });

  it('reports failed capability checks without capturing frames and cleans private images', async () => {
    mocks.canRender.mockResolvedValue({canRender:false,issues:[{message:'H.264 unsupported'}]});
    await expect(renderBrowserVideo(sampleProject,{assets:bytes()})).rejects.toThrow('H.264 unsupported'); expect(mocks.render).not.toHaveBeenCalled(); expect(revoked).toHaveBeenCalledOnce();
  });

  it('reports decode failures without encoding and permits a new cold attempt', async () => {
    decode=()=>Promise.reject(new Error('invalid pixels'));
    await expect(renderBrowserVideo(sampleProject,{assets:bytes()})).rejects.toThrow('could not be decoded'); expect(mocks.render).not.toHaveBeenCalled(); expect(revoked).toHaveBeenCalledOnce();
    decode=()=>Promise.resolve(); await renderBrowserVideo(sampleProject,{assets:bytes()}); expect(mocks.render).toHaveBeenCalledOnce(); expect(created).toHaveBeenCalledTimes(2);
  });

  it('cancels font readiness promptly, then releases images even if the font never settles', async () => {
    vi.stubGlobal('document',{fonts:{ready:new Promise(()=>{})}}); const abort=new AbortController();
    const run=renderBrowserVideo(sampleProject,{assets:bytes(),signal:abort.signal}); await vi.waitFor(()=>expect(mocks.canRender).toHaveBeenCalled()); abort.abort();
    await expect(run).rejects.toMatchObject({name:'AbortError'}); expect(mocks.render).not.toHaveBeenCalled(); expect(revoked).toHaveBeenCalledOnce();
  });

  it('keeps private image URLs until the completed Blob has been retrieved', async () => {
    const output=deferred<Blob>(); mocks.render.mockResolvedValue({getBlob:()=>output.promise});
    const run=renderBrowserVideo(sampleProject,{assets:bytes()}); await vi.waitFor(()=>expect(mocks.render).toHaveBeenCalled());
    expect(revoked).not.toHaveBeenCalled(); output.resolve(complete()); await run; expect(revoked).toHaveBeenCalledOnce();
  });
});
