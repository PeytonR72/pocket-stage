// Portable fallback: reads only this JSON snapshot; no IndexedDB or object URLs.
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia,selectComposition} from '@remotion/renderer';
const input=process.argv[2];
if(!input) throw new Error('Usage: npm run render:local -- project.pocket-stage.json [output.mp4]');
const project=JSON.parse(await readFile(input,'utf8'));
if(project.schemaVersion!==1||!project.assets?.main||project.layout!=='landscape')throw new Error('Unsupported Pocket Stage project package');
for(const asset of Object.values(project.assets)){if(!asset||!/^data:image\/(png|jpeg|webp);base64,/.test(asset.src)||!(asset.width>0&&asset.height>0))throw new Error('Package must contain embedded normalized image bytes')}
const serveUrl=await bundle({entryPoint:path.resolve('src/composition/Root.tsx')});
const inputProps={project};const composition=await selectComposition({serveUrl,id:'PocketStage',inputProps});
const outputLocation=path.resolve(process.argv[3]||'proof/local-proof.mp4');await mkdir(path.dirname(outputLocation),{recursive:true});
await renderMedia({composition,serveUrl,inputProps,codec:'h264',pixelFormat:'yuv420p',muted:true,outputLocation,concurrency:1,chromiumOptions:{gl:'angle',enableMultiProcessOnLinux:true},onProgress:({progress})=>process.stdout.write(`\rRendering ${Math.round(progress*100)}%`)});
console.log(`\nSaved ${outputLocation}`);
