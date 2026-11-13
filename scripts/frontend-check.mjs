import {chromium} from 'playwright';
import {preview} from 'vite';
import {ensureBrowser} from '@remotion/renderer';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out=path.resolve(process.env.BASE_URL?'qa/hosted':'qa/frontend');
await mkdir(out,{recursive:true});
const report={checks:[],errors:[],failed:[]};
const assert=(value,message)=>{if(!value)throw new Error(message)};
let browser,server;
try{
 if(!process.env.BASE_URL)server=await preview({preview:{host:'127.0.0.1',port:5190,strictPort:true}});
 const base=process.env.BASE_URL||'http://127.0.0.1:5190';
 const installedBrowser=await ensureBrowser();
 if(!('path' in installedBrowser))throw new Error('Chrome Headless Shell is unavailable. Run npx remotion browser ensure.');
 browser=await chromium.launch({executablePath:installedBrowser.path,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
 const page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(String(error)));
 page.on('requestfailed',r=>report.failed.push({url:r.url(),error:r.failure()}));
 const response=await page.goto(base);assert(response.status()===200,'Landing HTTP failure');
 await page.getByRole('heading',{level:1}).waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.locator('video').waitFor();
 await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement?.textContent?.includes('Skip to content')),'Skip link unreachable');
 for(const [label,file] of [['Download demo','backstep-showcase.mp4'],['Download editable demo','backstep.pocket-stage.json']]){const pending=page.waitForEvent('download');await page.getByRole('link',{name:label,exact:true}).click();const d=await pending;const target=path.join(out,file);await d.saveAs(target);const digest=b=>createHash('sha256').update(b).digest('hex');assert(digest(await readFile(target))===digest(await readFile(path.join('public','demo',file))),'Download bytes differ');}
 report.checks.push('Keyboard skip link and both exact-byte downloads');
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
 assert(await page.locator('video').evaluate(v=>v.paused),'Reduced motion video must be paused');
 assert(await page.evaluate(()=>!window.__studio),'Editor eagerly mounted');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop overflow');
 report.checks.push('Landing HTTP, typography loaded, no overflow, editor lazy, reduced motion paused');
 await page.locator('video').evaluate(async v=>{await v.play()});
 await page.waitForFunction(()=>document.querySelector('video').ended,null,{timeout:25000});
 report.video=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error,ended:v.ended}));
 assert(report.video.duration===12&&report.video.width===1920&&!report.video.error,'Demo playback failed');report.checks.push('Actual 12-second Backstep MP4 plays through');
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');report.checks.push('Mobile 390px has no overflow');
 await page.setViewportSize({width:320,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'320px overflow');
 await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('error')));await page.getByRole('status').filter({hasText:'demo could not play'}).waitFor();report.checks.push('Video error recovery message');
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:/Open studio/i}).first().click();
 await page.waitForURL('**/studio');await page.waitForFunction(()=>window.__studio?.getProject()?.assets?.main);await page.getByText('Saved on this device',{exact:true}).waitFor();await page.evaluate(()=>window.__studio.pause());
 await page.getByLabel('Product name',{exact:true}).fill('Hosted studio check');await page.getByRole('button',{name:'Paper',exact:true}).click();await page.getByText('Saved on this device',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>window.__studio?.getProject()?.name==='Hosted studio check');
 assert(await page.evaluate(()=>window.__studio.getProject().theme)==='paper','Theme persistence failure');report.checks.push('Open studio CTA, direct /studio reload, IndexedDB copy and theme persistence');
 await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Open a Pocket Stage project',{exact:true}).setInputFiles(path.resolve('public/demo/backstep.pocket-stage.json'));await page.waitForFunction(()=>window.__studio.getProject().name==='Backstep');await page.evaluate(()=>{window.__studio.pause();window.__studio.seek(60)});await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'studio.png'),fullPage:true});
 report.checks.push('Portable Backstep project reopens with actual image assets');
 if(process.env.RENDER==='1'){
  await page.getByRole('button',{name:'Export video',exact:true}).click();
  const deadline=Date.now()+20*60*1000;
  for(;;){const state=await page.evaluate(()=>window.__studio.getExportState());console.log('EXPORT',state.status,Math.round(state.progress*100));if(state.status==='ready'){report.export=state;break}if(state.status==='error')throw new Error(state.error);assert(Date.now()<deadline,'Export timeout');await page.waitForTimeout(5000)}
  const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Download MP4',exact:true}).click();const download=await pending;await download.saveAs(path.join(out,'hosted-backstep.mp4'));assert(!await download.failure(),'Export download failed');report.checks.push('Hosted browser full 360-frame export and MP4 download');
 }
 assert(!report.errors.length,report.errors.join('\n'));report.checks.push('No uncaught browser errors');
 console.log(JSON.stringify(report,null,2));
}catch(e){report.fatal=String(e);console.error(e);process.exitCode=1}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve))}
