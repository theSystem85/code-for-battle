// Headed hardware-GPU diagnostic, not a 75 FPS certificate. Run serially.
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--enable-unsafe-swiftshader']});
const out=process.env.BENCHMARK_OUTPUT || 'tmp/scrolling-analysis/fixed';
fs.mkdirSync(out.slice(0,out.lastIndexOf('/')) || '.', { recursive:true });
const minutes=Number(process.env.BENCHMARK_MINUTES || 5), density=process.env.BENCHMARK_DPR ? Number(process.env.BENCHMARK_DPR) : null, size=Number(process.env.BENCHMARK_MAP_SIZE || 200);
try {
 const bc=await browser.newBrowserCDPSession();const system=await bc.send('SystemInfo.getInfo');
 if(!/Apple|NVIDIA|AMD|Intel|Adreno|Mali|Radeon/i.test(JSON.stringify(system.gpu.devices)) || /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(system.gpu.devices[0].deviceString)||system.gpu.featureStatus.rasterization!=='enabled')throw Error('Hardware gate failed');
 const context=await browser.newContext(density ? {viewport:{width:1280,height:720},deviceScaleFactor:density} : {viewport:null});
 if(process.env.BENCHMARK_BACKEND) await context.addInitScript(backend=>localStorage.setItem('rts_graphics_settings',JSON.stringify({rendererBackendChoice:backend})),process.env.BENCHMARK_BACKEND);
 await context.addInitScript(()=>{localStorage.setItem('tutorial-settings',JSON.stringify({showTutorial:false,speechEnabled:false}));localStorage.setItem('tutorial-progress',JSON.stringify({completed:true,stepIndex:0}));});
 await context.addInitScript(() => {
  window.__CFB_TERRAIN_GPU_TIMING__ = true;
  window.rasterProbe = { canvases: 0, contexts: 0, dimensionWrites: 0, imageData: 0 };
  const create = Document.prototype.createElement, get = HTMLCanvasElement.prototype.getContext;
  const imageData = CanvasRenderingContext2D.prototype.createImageData, seen = new WeakSet();
  Document.prototype.createElement = function(tag, ...rest) { if (String(tag).toLowerCase() === 'canvas') rasterProbe.canvases++; return create.call(this, tag, ...rest); };
  HTMLCanvasElement.prototype.getContext = function(...args) { if (!seen.has(this)) { seen.add(this); rasterProbe.contexts++; } return get.apply(this, args); };
  CanvasRenderingContext2D.prototype.createImageData = function(...args) { rasterProbe.imageData++; return imageData.apply(this, args); };
  for (const key of ['width', 'height']) {
   const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key);
   Object.defineProperty(HTMLCanvasElement.prototype, key, { ...descriptor, set(value) { rasterProbe.dimensionWrites++; descriptor.set.call(this, value); } });
  }
 });
 await context.addInitScript(() => {
  const post = Worker.prototype.postMessage;
  const observed = new WeakSet(), started = new Map();
  window.checkpointProbe = { posts: [], completions: [], errors: [] };
  Worker.prototype.postMessage = function(message, ...rest) {
   if (!['reset', 'chunk', 'configuration', 'encode'].includes(message?.type)) return post.call(this, message, ...rest);
   if (!observed.has(this)) {
    observed.add(this);
    this.addEventListener('message', ({ data }) => {
     if (started.has(data.id)) checkpointProbe.completions.push({ t: performance.now(), elapsed: performance.now() - started.get(data.id), bytes: data.encoded?.length, error: data.error });
    });
    this.addEventListener('error', event => checkpointProbe.errors.push(event.message));
   }
   const t = performance.now();
   if (message.type === 'encode') started.set(message.id, t);
   try { return post.call(this, message, ...rest); }
   finally { checkpointProbe.posts.push({ t, type: message.type, duration: performance.now() - t }); }
  };
 });
 const page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const initialCadence=await page.evaluate(async()=>{
  const intervals=[];let last;const start=performance.now();
  await new Promise(resolve=>{function frame(now){if(last!==undefined)intervals.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});
  return {fps:1000*intervals.length/intervals.reduce((a,b)=>a+b,0),intervals};
 });
 fs.writeFileSync(out+'-initial-cadence.json',JSON.stringify(initialCadence));
 const preparationStart=Date.now();
 await page.goto(`${process.env.BENCHMARK_URL || 'http://127.0.0.1:4176'}/?seed=11&size=${size}&players=4&oreFields=24`);
 await page.waitForFunction(()=>window.gameState?.gameStarted&&window.gameInstance?.gameLoop?.allAssetsLoaded&&window.gameInstance?.renderer?.textureManager.allTexturesLoaded,null,{timeout:120000});
 await page.waitForFunction(()=>['ready','failed'].includes(window.gameInstance.renderer.webgpuRenderer?.status),null,{timeout:30000}).catch(()=>{});
 await page.waitForFunction(()=>document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'));
 const preparationMs=Date.now()-preparationStart;
 const readyResources=await page.evaluate(()=>({...rasterProbe}));
 const checkpointWorker=page.workers().find(worker=>/checkpointEncoding/.test(worker.url()));
 if(!checkpointWorker) throw Error('Production checkpoint worker did not start');
 await checkpointWorker.evaluate(()=>true);
 const workers=page.workers().map(worker=>worker.url());
 await page.mouse.move(780,350);
 await page.evaluate(()=>{window.probe={longTasks:[],frames:[],phase:'idle',phaseStart:performance.now(),desiredX:gameState.scrollOffset.x,desiredY:gameState.scrollOffset.y,counts:[],lastCount:0,lastHeap:null};new PerformanceObserver(list=>probe.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});const original=gameInstance.renderer.renderGame;gameInstance.renderer.renderGame=function(...args){gameState.scrollOffset.x=probe.desiredX;gameState.scrollOffset.y=probe.desiredY;return original.apply(this,args)};const l=gameInstance.gameLoop;const f=l.fpsDisplay.reportFrameBreakdown;l.fpsDisplay.reportFrameBreakdown=function(b){const now=performance.now();if(now-probe.lastCount>1000){probe.lastCount=now;probe.lastHeap=performance.memory?.usedJSHeapSize;probe.counts.push({t:now,units:gameInstance.units.length,buildings:gameState.buildings.length,bullets:gameInstance.gameLoop.bullets.length,effects:Object.fromEntries(Object.entries(gameState).filter(([key,v])=>Array.isArray(v)&&/smoke|particle|explosion|wreck|effect|fire/i.test(key)).map(([key,v])=>[key,v.length])),rasters:{...rasterProbe},terrainCanvases:{...gameInstance.renderer.mapRenderer.chunkCanvasStats},gpuGround:{...gameState.renderStats?.gpuStaticGround},organic:[gameInstance.renderer.mapRenderer.organicTerrain.biomeBlendMasks,gameInstance.renderer.mapRenderer.organicTerrain.biomeTransitionTileCache,gameInstance.renderer.mapRenderer.organicTerrain.biomeSotTileCache].map(cache=>({entries:cache.size,...cache.stats})),visibility:document.visibilityState,focused:document.hasFocus(),shadow:gameState.shadowOfWarEnabled,gameTime:gameState.gameTime,backend:gameState.renderStats?.gpuTerrain?.backend,heap:probe.lastHeap})}probe.frames.push({t:now,phase:probe.phase,x:gameState.scrollOffset.x,y:gameState.scrollOffset.y,...b,chunk:{...gameState.renderStats?.mapChunks},heap:probe.lastHeap,gpu:gameState.renderStats?.gpuTiming?.milliseconds,staticGpu:gameState.renderStats?.gpuStaticGround?.gpuMilliseconds,gpuGround:{...gameState.renderStats?.gpuStaticGround}});return f.call(this,b)};});
 async function phase(name,duration,scroll=false){
  console.log('START',name);
  const metricsStart=await cdp.send('Performance.getMetrics');
  const result=await page.evaluate(async({name,duration,scroll})=>{
   const s=window.gameState,c=document.getElementById('gameCanvas');const width=gameInstance.gameLoop.mapGrid[0].length*32-c.clientWidth,height=gameInstance.gameLoop.mapGrid.length*32-c.clientHeight;
   const rows=Math.ceil(height/(c.clientHeight*.8));const rowH=height/rows;const route=[];for(let i=0;i<=rows;i++){route.push({x:i%2?width:0,y:i*rowH});route.push({x:i%2?0:width,y:i*rowH})}route.push({x:0,y:0});
   const lengths=route.slice(1).map((p,i)=>Math.hypot(p.x-route[i].x,p.y-route[i].y));const total=lengths.reduce((a,b)=>a+b,0);let count=0;const intervals=[];const start=performance.now();let last;
   probe.phase=name;probe.phaseStart=start;
   await new Promise(resolve=>{function frame(now){if(last!==undefined)intervals.push(now-last);last=now;const elapsed=now-start;if(scroll){let d=(elapsed*3.6)%total;let i=0;while(i<lengths.length-1&&d>lengths[i])d-=lengths[i++];const p=route[i],q=route[i+1],f=d/lengths[i];probe.desiredX=p.x+(q.x-p.x)*f;probe.desiredY=p.y+(q.y-p.y)*f;gameInstance.gameLoop.requestRender()}count++;if(elapsed<duration)requestAnimationFrame(frame);else resolve()};requestAnimationFrame(frame)});
   return {name,intervals,resources:{...rasterProbe},checkpoint:{posts:checkpointProbe.posts.filter(p=>p.t>=start),completions:checkpointProbe.completions.filter(p=>p.t>=start),errors:checkpointProbe.errors},longTasks:probe.longTasks,counts:probe.counts,settings:{shadow:s.shadowOfWarEnabled,glow:s.crystalGlowEnabled},duration:performance.now()-start,count,totalRouteDistance:total,travelled:scroll?duration*3.6:0,backend:JSON.parse(JSON.stringify(s.renderStats?.gpuTerrain)),dpr:devicePixelRatio,canvas:{w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight},units:gameInstance.units.length,buildings:s.buildings.length,limiter:s.frameLimiterEnabled,textureMode:gameInstance.renderer.textureManager.integratedSpriteSheetMode};
  },{name,duration,scroll});
  await checkpointWorker.evaluate(()=>true);
  const metricsEnd=await cdp.send('Performance.getMetrics');result.metricsDelta=Object.fromEntries(metricsEnd.metrics.map(({name,value})=>[name,value-(metricsStart.metrics.find(m=>m.name===name)?.value||0)]));
  fs.writeFileSync(out+'-'+name+'.json',JSON.stringify(result));fs.writeFileSync(out+'-'+name+'-frames.json',JSON.stringify(await page.evaluate(()=>probe.frames)));await page.evaluate(()=>{probe.frames=[];probe.counts=[];probe.longTasks=[]});const v=result.intervals.slice().sort((a,b)=>a-b);const p=q=>v[Math.ceil(v.length*q)-1];console.log(JSON.stringify({name,fps:1000/(v.reduce((a,b)=>a+b,0)/v.length),p95:p(.95),p99:p(.99),max:p(1),over33:v.filter(x=>x>33.4).length,backend:result.backend?.backend}));return result;
 }
 const results=[];
 for(let minute=1;minute<=minutes;minute++) {
  const profile=minute===Number(process.env.BENCHMARK_PROFILE_MINUTE || 0);
  if(profile) { await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');await bc.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'}); }
  results.push(await phase('minute-'+minute,60000,true));
  if(profile) {
   fs.writeFileSync(out+'-minute-'+minute+'.cpuprofile',JSON.stringify((await cdp.send('Profiler.stop')).profile));
   const done=new Promise(resolve=>bc.once('Tracing.tracingComplete',resolve));await bc.send('Tracing.end');const {stream}=await done;let trace='';for(;;){const chunk=await bc.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break}await bc.send('IO.close',{handle:stream});fs.writeFileSync(out+'-minute-'+minute+'-trace.json',trace);
  }
 }

 fs.writeFileSync(out+'-metadata.json',JSON.stringify({initialCadence,preparationMs,readyResources,workers,gpu:system.gpu,version:await browser.version(),errors,results:results.map(({intervals,...r})=>r)},null,2));
 console.log('Hardware:',system.gpu.devices[0].deviceString);
 const measureCadence=()=>page.evaluate(async()=>{
  const intervals=[];let last;const start=performance.now();
  await new Promise(resolve=>{function frame(now){if(last!==undefined)intervals.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});
  return {fps:1000*intervals.length/intervals.reduce((a,b)=>a+b,0),intervals,visible:document.visibilityState,focused:document.hasFocus()};
 });
 await page.evaluate(()=>gameInstance.gameLoop.stop());const stopped=await measureCadence();await page.goto('about:blank');const blank=await measureCadence();fs.writeFileSync(out+'-cadence-controls.json',JSON.stringify({stopped,blank}));console.log('Cadence controls:',JSON.stringify({stopped:stopped.fps,blank:blank.fps}));


}finally{await browser.close()}
