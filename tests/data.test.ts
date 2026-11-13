import {beforeEach,describe,it,expect,vi} from 'vitest';
import 'fake-indexeddb/auto';
import {sampleProject} from '../src/composition/types';
import {validateDocument,validateSnapshot,sampleDocument,type AssetRecord,type ProjectSnapshot} from '../src/model/project';
import {normalizedDimensions,detectImageType,normalizeImage,MAX_IMAGE_BYTES} from '../src/assets/images';
import {IndexedProjectStore} from '../src/storage/projectStore';
import {parsePackage} from '../src/model/package';
import {ProjectController} from '../src/model/ProjectController';
const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const asset=(id='main'):AssetRecord=>({id,blob:png,name:'Screenshot',width:1200,height:800});
const snapshot=(name='Project'):ProjectSnapshot=>({document:{...sampleDocument,name,assets:{main:'main'}},assets:[asset()]});
const decoder=vi.fn(async (_b:Blob,name:string)=>({...asset(crypto.randomUUID()),name}));
const deferred=<T,>()=>{let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
function controller(options:ConstructorParameters<typeof ProjectController>[0]={}){return new ProjectController({store:{load:async()=>null,save:async()=>{}},decode:decoder,loadSample:async()=>png,createUrl:a=>'blob:'+a.size+':'+crypto.randomUUID(),revokeUrl:vi.fn(),...options});}
const tick=()=>new Promise(r=>setTimeout(r,0));
const portable=(changes:Record<string,unknown>={})=>new File([JSON.stringify({...sampleProject,assets:{main:{...asset(),blob:undefined,src:'data:image/png;base64,iVBORw0KGgoB'}},...changes})],'project.json',{type:'application/json'});
beforeEach(()=>vi.clearAllMocks());
describe('schema and image validation',()=>{
 it('enforces schema, limits, required main and allowed styles',()=>{
  for(const changes of [{schemaVersion:2},{name:'a'.repeat(41)},{featureCaption:'a'.repeat(81)},{theme:'other'},{accent:'red'},{assets:{}},{layout:'portrait'},{assets:{main:'one',detail:'one'}}])expect(()=>validateDocument({...sampleDocument,...changes})).toThrow();
  expect(validateDocument({...sampleDocument,name:'a'.repeat(40),openingCaption:'',closingUrl:''}).name).toHaveLength(40);
 });
 it('clamps finite focal points and rejects nonfinite values',()=>{
  expect(validateDocument({...sampleDocument,focalPoint:{x:-4,y:9}}).focalPoint).toEqual({x:0,y:1});
  for(const x of [NaN,Infinity,'0.4',null])expect(()=>validateDocument({...sampleDocument,focalPoint:{x,y:0.5}})).toThrow();
 });
 it('sniffs bytes so SVG and misleading filename/mime cannot pass',async()=>{
  expect(await detectImageType(png)).toBe('image/png');
  await expect(detectImageType(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'],{type:'image/png'}))).rejects.toThrow('valid PNG');
  await expect(normalizeImage(new Blob([new Uint8Array(MAX_IMAGE_BYTES+1)]),'huge.png')).rejects.toThrow('10 MB');
 });
 it('caps long edge proportionally and rejects over 24MP',()=>{
  expect(normalizedDimensions(3000,1600)).toEqual({width:2560,height:1365});expect(normalizedDimensions(800,1600)).toEqual({width:800,height:1600});
  expect(()=>normalizedDimensions(6000,4100)).toThrow('24 megapixels');
 });
 it('rejects missing and dangling records',()=>{expect(()=>validateSnapshot({...snapshot(),assets:[]})).toThrow();expect(()=>validateSnapshot({...snapshot(),assets:[asset('other')]})).toThrow();});
});
describe('real IndexedDB persistence',()=>{
 it('restores all settings and actual Blob bytes in one transaction',async()=>{
  const store=new IndexedProjectStore('test-'+crypto.randomUUID());const s=snapshot();s.document={...s.document,theme:'paper',accent:'#123456',focalPoint:{x:0.1,y:0.9},featureCaption:'Saved text',assets:{main:'main',extra:'extra'}};s.assets.push(asset('extra'));
  await store.save(s);const restored=(await store.load())!;expect(restored.document).toEqual(s.document);expect(await restored.assets[0].blob.arrayBuffer()).toEqual(await png.arrayBuffer());expect(restored.assets).toHaveLength(2);
  await store.save(snapshot('Latest'));expect((await store.load())!.document.name).toBe('Latest');expect((await store.load())!.assets).toHaveLength(1);
 });
});
describe('controller atomic behavior and races',()=>{
 it('failed decode leaves the previous valid screenshot and settings intact',async()=>{
  const c=controller();await c.start();const original=c.getState().project;c.update({name:'Changed'});decoder.mockRejectedValueOnce(new Error('Invalid image'));
  expect(await c.replaceAsset('main',new File(['bad'],'bad.png'))).toBe(false);expect(c.getState().project.assets.main).toEqual(original.assets.main);expect(c.getState().project.name).toBe('Changed');expect(c.getState().error).toBe('Invalid image');c.dispose();
 });
 it('keeps the most recently requested replacement when decodes finish out of order',async()=>{
  const c=controller();await c.start();const slow=deferred<AssetRecord>();decoder.mockImplementationOnce(()=>slow.promise);const p=c.replaceAsset('detail',new File(['a'],'slow.png'));
  await c.replaceAsset('detail',new File(['b'],'new.png'));slow.resolve({...asset('slow'),name:'slow.png'});expect(await p).toBe(false);expect(c.getState().project.assets.detail?.name).toBe('new.png');c.dispose();
 });
 it('applies a finished upload to the latest settings without losing intervening edits',async()=>{
  const c=controller();await c.start();const slow=deferred<AssetRecord>();decoder.mockImplementationOnce(()=>slow.promise);const p=c.replaceAsset('main',new File(['a'],'new.png'));c.update({name:'New name',focalPoint:{x:0.2,y:0.8}});slow.resolve(asset('latest'));expect(await p).toBe(true);expect(c.getState().project.name).toBe('New name');expect(c.getState().project.focalPoint).toEqual({x:0.2,y:0.8});c.dispose();
 });
 it('captures immutable export metadata and image bytes before later edits',async()=>{
  const c=controller();await c.start();const capture=c.captureForExport();const originalName=capture.project.name;const originalAsset=capture.project.assets.main;c.update({name:'Edited'});await c.replaceAsset('main',new File(['a'],'replacement.png'));c.pruneUrls();expect(capture.project.name).toBe(originalName);expect(capture.project.assets.main).toEqual(originalAsset);expect(capture.assets.get(originalAsset.id)).toBeInstanceOf(Blob);c.dispose();
 });
 it('clear cancels an optional upload and Main remains required',async()=>{
  const c=controller();await c.start();const slow=deferred<AssetRecord>();decoder.mockImplementationOnce(()=>slow.promise);const p=c.replaceAsset('extra',new File(['a'],'slow.png'));c.clearAsset('extra');slow.resolve(asset('old'));await p;expect(c.getState().project.assets.extra).toBeUndefined();
  c.clearAsset('main' as 'extra');expect(c.getState().project.assets.main).toBeDefined();c.dispose();
 });
 it('serializes writes so older writes cannot finish over newer settings',async()=>{
  const first=deferred<void>();const written:string[]=[];let active=0;let max=0;let count=0;
  const store={load:async()=>null,save:async(s:ProjectSnapshot)=>{active++;max=Math.max(max,active);if(++count===1)await first.promise;written.push(s.document.name);active--;}};
  const c=controller({store});await c.start();c.update({name:'Earlier'});c.update({name:'Latest'});first.resolve();await tick();expect(max).toBe(1);expect(written.at(-1)).toBe('Latest');expect(c.getState().saveStatus).toBe('saved');c.dispose();
 });
 it('shows storage failure and retains editable session; later update retries',async()=>{
  const save=vi.fn(async()=>{});const c=controller({store:{load:async()=>null,save}});await c.start();await tick();save.mockRejectedValueOnce(new Error('Quota exceeded'));c.update({name:'Still here'});await tick();expect(c.getState().saveStatus).toBe('error');expect(c.getState().error).toContain('Quota exceeded');expect(c.getState().project.name).toBe('Still here');c.update({theme:'paper'});await tick();expect(c.getState().saveStatus).toBe('saved');c.dispose();
 });
 it('restores fresh URLs and revokes superseded URLs after commit and all on disposal',async()=>{
  const revoke=vi.fn();const c=controller({store:{load:async()=>snapshot(),save:async()=>{}},revokeUrl:revoke});await c.start();const old=c.getState().project.assets.main.src;await c.replaceAsset('main',new File(['a'],'new.png'));expect(revoke).not.toHaveBeenCalled();c.pruneUrls();expect(revoke).toHaveBeenCalledWith(old);c.dispose();expect(revoke).toHaveBeenCalledTimes(2);
 });
 it('corrupt save fallback reports restore error and does not silently overwrite storage',async()=>{
  const save=vi.fn(async()=>{});const c=controller({store:{load:async()=>{throw new Error('Corrupt save');},save}});await c.start();expect(c.getState().ready).toBe(true);expect(c.getState().error).toContain('Could not restore');expect(save).not.toHaveBeenCalled();c.dispose();
 });
});
describe('portable imports are validated and atomic',()=>{
 it('decodes embedded image bytes and rejects declared dimension mismatch',async()=>{
  const result=await parsePackage(portable(),decoder);expect(result.assets[0].blob).toBeInstanceOf(Blob);expect(result.document.assets.main).toBe('main');
  const bad=portable({assets:{main:{...sampleProject.assets.main,src:'data:image/png;base64,iVBORw0KGgoB',width:10,height:10}}});await expect(parsePackage(bad,decoder)).rejects.toThrow('dimensions');
 });
 it('invalid imported settings are rejected before image processing',async()=>{await expect(parsePackage(portable({name:'x'.repeat(41)}),decoder)).rejects.toThrow();expect(decoder).not.toHaveBeenCalled();});
 it('failed import of another slot never replaces any current settings/images',async()=>{
  const c=controller();await c.start();const original=c.getState().project;decoder.mockRejectedValueOnce(new Error('Broken embedded image'));expect(await c.importPackage(portable({name:'Imported'}))).toBe(false);expect(c.getState().project).toBe(original);c.dispose();
 });
 it('does not overwrite edits made during asynchronous import',async()=>{
  const c=controller();await c.start();const slow=deferred<AssetRecord>();decoder.mockImplementationOnce(()=>slow.promise);const importing=c.importPackage(portable({name:'Import'}));await tick();c.update({name:'Edited while loading'});slow.resolve(asset());expect(await importing).toBe(false);expect(c.getState().project.name).toBe('Edited while loading');c.dispose();
 });
 it('renews imported IDs so identical IDs with different bytes do not reuse stale URLs',async()=>{
  const c=controller();await c.start();expect(await c.importPackage(portable())).toBe(true);const first=c.getState().project.assets.main;expect(await c.importPackage(portable())).toBe(true);expect(c.getState().project.assets.main.id).not.toBe(first.id);expect(c.getState().project.assets.main.src).not.toBe(first.src);c.dispose();
 });
});
