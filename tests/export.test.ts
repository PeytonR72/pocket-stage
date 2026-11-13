import {describe, expect, it, vi} from 'vitest';
import {sampleProject} from '../src/composition/types';
import {ExportController, videoFilename} from '../src/export/ExportController';
import {abortable, createRenderSnapshot} from '../src/export/snapshot';
import type {BrowserRenderOptions} from '../src/export/browser';

const video = () => new Blob(['complete encoded video'], {type:'video/mp4'});
const deferred = <T,>() => {let resolve!:(value:T)=>void; let reject!:(error:unknown)=>void; const promise = new Promise<T>((yes,no) => {resolve=yes; reject=no;}); return {promise,resolve,reject};};
const urls = () => {let id=0; return {createUrl:vi.fn(() => `blob:owned-${++id}`), revokeUrl:vi.fn()};};

describe('export lifecycle', () => {
  it('shows all phases, captures input before yielding, and exposes only a completed MP4', async () => {
    const pending = deferred<Blob>(); let callbacks!:BrowserRenderOptions;
    const project = structuredClone(sampleProject); const bytes = new Map([[project.assets.main.id, new Blob(['original pixels'])]]);
    const render = vi.fn((captured, options) => {callbacks=options; expect(captured.name).toBe('Fieldwork'); return pending.promise;});
    const own = urls(); const controller = new ExportController({render,...own});
    const run = controller.start(project, bytes);
    project.name='Changed after clicking'; bytes.clear();
    expect(render.mock.calls[0][0].name).toBe('Fieldwork');
    expect(render.mock.calls[0][1].assets?.size).toBe(1);
    expect(controller.getState()).toMatchObject({status:'preparing',download:null});
    callbacks.onPhase?.('checking'); expect(controller.getState().status).toBe('checking');
    callbacks.onPhase?.('rendering'); callbacks.onProgress?.(.5); callbacks.onProgress?.(.2); callbacks.onProgress?.(Number.NaN);
    expect(controller.getState()).toMatchObject({status:'rendering',progress:.5,download:null});
    expect(own.createUrl).not.toHaveBeenCalled();
    pending.resolve(video()); await run;
    expect(controller.getState()).toMatchObject({status:'ready',progress:1,download:{filename:'fieldwork-pocket-stage-1080p.mp4',url:'blob:owned-1'}});
  });

  it('cancel preserves the project, ignores stale callbacks/completion, and permits retry', async () => {
    const first = deferred<Blob>(); const second = deferred<Blob>(); const callbacks:BrowserRenderOptions[]=[];
    const render = vi.fn((_project,options) => {callbacks.push(options); return callbacks.length===1?first.promise:second.promise;});
    const own=urls(); const controller = new ExportController({render,...own}); const project=structuredClone(sampleProject); const original=structuredClone(project);
    const run1=controller.start(project); controller.cancel();
    expect(callbacks[0].signal?.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({status:'cancelled',download:null});
    const run2=controller.start(project); callbacks[0].onProgress?.(.9); callbacks[0].onPhase?.('checking'); first.resolve(video()); await run1;
    expect(controller.getState()).toMatchObject({status:'preparing',progress:0,download:null});
    second.resolve(video()); await run2;
    expect(controller.getState().status).toBe('ready'); expect(own.createUrl).toHaveBeenCalledTimes(1); expect(project).toEqual(original);
  });

  it('reports capability/runtime failures, rejects incomplete output, and retries', async () => {
    const render=vi.fn().mockRejectedValueOnce(new Error('H.264 is unavailable')).mockResolvedValueOnce(new Blob([],{type:'video/mp4'})).mockResolvedValueOnce(new Blob(['not video'],{type:'text/plain'})).mockResolvedValueOnce(video());
    const controller=new ExportController({render,...urls()});
    await controller.start(sampleProject); expect(controller.getState()).toMatchObject({status:'error',error:'H.264 is unavailable',download:null});
    await controller.start(sampleProject); expect(controller.getState()).toMatchObject({status:'error',download:null});
    await controller.start(sampleProject); expect(controller.getState()).toMatchObject({status:'error',download:null});
    await controller.start(sampleProject); expect(controller.getState().status).toBe('ready');
  });

  it('releases completed URLs on replacement/reset/dispose and ignores work after disposal', async () => {
    const own=urls(); const controller=new ExportController({render:vi.fn().mockResolvedValue(video()),...own});
    await controller.start(sampleProject); await controller.start(sampleProject);
    expect(own.revokeUrl).toHaveBeenCalledWith('blob:owned-1');
    controller.reset(); expect(own.revokeUrl).toHaveBeenCalledWith('blob:owned-2'); expect(controller.getState().status).toBe('idle');
    await controller.start(sampleProject); controller.dispose(); controller.dispose();
    expect(own.revokeUrl.mock.calls).toEqual([['blob:owned-1'],['blob:owned-2'],['blob:owned-3']]);
    await controller.start(sampleProject); expect(own.createUrl).toHaveBeenCalledTimes(3);
  });

  it('aborts on unmount without publishing a stale file or error', async () => {
    const pending=deferred<Blob>(); const own=urls(); let signal:AbortSignal|undefined;
    const controller=new ExportController({render:(_p,o)=>{signal=o.signal;return pending.promise;},...own}); const listener=vi.fn(); controller.subscribe(listener);
    const run=controller.start(sampleProject); controller.dispose(); const count=listener.mock.calls.length; pending.reject(new Error('late renderer error')); await run;
    expect(signal?.aborted).toBe(true); expect(listener).toHaveBeenCalledTimes(count); expect(own.createUrl).not.toHaveBeenCalled();
  });

  it('uses safe useful filenames even for punctuation, path components, and long names', () => {
    expect(videoFilename('../../ Café / Demo:*?')).toBe('cafe-demo-pocket-stage-1080p.mp4');
    expect(videoFilename('💫')).toBe('showcase-pocket-stage-1080p.mp4');
    expect(videoFilename('a'.repeat(100))).toHaveLength(64+'-pocket-stage-1080p.mp4'.length);
  });
});

describe('immutable render images', () => {
  it('owns image bytes independently from editable URLs and freezes all composition input', async () => {
    const own=urls(); const project=structuredClone(sampleProject); project.assets.main.src='blob:source';
    const blob=new Blob(['pixels'],{type:'image/png'}); const bytes=new Map([[project.assets.main.id,blob]]); const fetchAsset=vi.fn();
    const promise=createRenderSnapshot(project,{assets:bytes,...own,fetchAsset});
    project.name='edited'; project.focalPoint.x=.1; project.assets.main.src='blob:replacement'; bytes.clear();
    const frozen=await promise;
    expect(frozen.project.name).toBe('Fieldwork'); expect(frozen.project.focalPoint.x).toBe(.59); expect(frozen.project.assets.main.src).toBe('blob:owned-1');
    expect(own.createUrl).toHaveBeenCalledWith(blob); expect(fetchAsset).not.toHaveBeenCalled();
    expect(Object.isFrozen(frozen.project)).toBe(true); expect(Object.isFrozen(frozen.project.assets.main)).toBe(true);
    frozen.release(); frozen.release(); expect(own.revokeUrl).toHaveBeenCalledTimes(1);
  });

  it('fails for missing/empty bytes and cleans URLs created before an error', async () => {
    const own=urls(); const project=structuredClone(sampleProject);
    await expect(createRenderSnapshot(project,{assets:new Map(),...own})).rejects.toThrow('missing');
    project.assets.extra={...project.assets.main,id:'extra'};
    await expect(createRenderSnapshot(project,{assets:new Map([[project.assets.main.id,new Blob(['valid'])],['extra',new Blob([])]]),...own})).rejects.toThrow('empty');
    expect(own.revokeUrl).toHaveBeenCalledWith('blob:owned-1');
  });

  it('releases image URLs immediately on cancellation and remains idempotent', async () => {
    const own=urls(); const abort=new AbortController();
    const snapshot=await createRenderSnapshot(sampleProject,{assets:new Map([[sampleProject.assets.main.id,new Blob(['pixels'])]]),signal:abort.signal,...own});
    abort.abort(); snapshot.release(); expect(own.revokeUrl).toHaveBeenCalledTimes(1);
  });

  it('aborts pending image fetches without creating URLs or leaking late rejection', async () => {
    const own=urls(); const abort=new AbortController(); const pending=deferred<Blob>();
    const promise=createRenderSnapshot(sampleProject,{signal:abort.signal,fetchAsset:()=>pending.promise,...own}); abort.abort();
    await expect(promise).rejects.toMatchObject({name:'AbortError'}); pending.reject(new Error('source revoked')); await Promise.resolve(); expect(own.createUrl).not.toHaveBeenCalled();
  });

  it('rejects aborted readiness promises promptly', async () => {
    const abort=new AbortController(); const pending=deferred<void>(); const promise=abortable(pending.promise,abort.signal); abort.abort();
    await expect(promise).rejects.toMatchObject({name:'AbortError'}); pending.resolve();
  });
});
