// Scoped renderer stress diagnostic; headless results cannot certify presented 75 FPS.
import process from 'node:process'
import { URL } from 'node:url'
import console from 'node:console'
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']})
const results=[]
for(const dpr of [1,2,3]) {
 const context=await browser.newContext({deviceScaleFactor:dpr,viewport:{width:1280,height:800}})
 const page=await context.newPage()
 await page.route('**/turret-verify.html',r=>r.fulfill({contentType:'text/html',body:'<canvas id="c"></canvas>'}))
 if (process.env.TURRET_BENCH_BASELINE === '1') {
  const originals = new Map()
  const original = file => {
   if (!originals.has(file)) originals.set(file, execFileSync('git', ['show', `${process.env.TURRET_BENCH_BASELINE_REF || 'dc2df60c'}:${file}`]))
   return originals.get(file)
  }
  await page.route('**/src/rendering/turretImageRenderer.js', r => r.fulfill({contentType:'text/javascript',body:original('src/rendering/turretImageRenderer.js')}))
  await page.route('**/src/turretImageConfig.json', r => r.fulfill({contentType:'application/json',body:original('src/turretImageConfig.json')}))
  await page.route('**/images/prepared/**', r => {
   const file = `public${new URL(r.request().url()).pathname}`
   return r.fulfill({contentType:file.endsWith('.json') ? 'application/json' : 'image/webp', body:original(file)})
  })
 }
 await page.goto(`${process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'}/turret-verify.html`)
 results.push(await page.evaluate(async(dpr)=>{
  const pipeline=await import('/src/rendering/prepared/preparedSpritePipeline.js')
  const {renderTurretWithImages}=await import('/src/rendering/turretImageRenderer.js')
  const {gameState}=await import('/src/gameState.js')
  const manifest=await (await globalThis.fetch('/images/prepared/sprite-manifest.json')).json()
  manifest.entries=manifest.entries.filter(e=>e.id.startsWith('building:turretGun'))
  const prepared=await pipeline.prepareSpriteRegistry({fetchImpl:async()=>({ok:true,json:async()=>manifest}),density:dpr})
  pipeline.publishPreparedSpriteRegistry(prepared)
  const canvas=globalThis.document.getElementById('c'); canvas.width=1280*dpr;canvas.height=800*dpr;canvas.style.width='1280px';canvas.style.height='800px'
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr)
  const buildings=Array.from({length:240},(_,i)=>({type:`turretGunV${i%3+1}`,turretDirection:i*0.1,muzzleFlashStartTime:1000,recoilStartTime:1000,muzzleFlashIndex:i%3}))
  const times=[], frames=[]; const initialHeap=globalThis.performance.memory?.usedJSHeapSize; let previous
  for(let frame=0;frame<120;frame++) {
   const time=await new Promise(globalThis.requestAnimationFrame); if(previous) frames.push(time-previous);previous=time
   const start=globalThis.performance.now(); gameState.simulationTime=1000+frame%6*16
   ctx.clearRect(0,0,1280,800)
   for(let i=0;i<buildings.length;i++) renderTurretWithImages(ctx,buildings[i],(i%24)*48+frame%40,Math.floor(i/24)*64,32,32)
   times.push(globalThis.performance.now()-start)
  }
  const summary=a=>{const b=[...a].sort((a,b)=>a-b);return{p95:b[Math.floor(b.length*.95)],p99:b[Math.floor(b.length*.99)],max:b.at(-1),mean:a.reduce((x,y)=>x+y,0)/a.length}}
  return {dpr,backend:'Canvas2D headless Chromium',entities:240,cpu:summary(times),coldCpu:summary(times.slice(0,30)),repeatCpu:summary(times.slice(30)),frame:summary(frames),fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length),missed:frames.filter(x=>x>1000/75).length,initialHeap,heap:globalThis.performance.memory?.usedJSHeapSize}
 },dpr))
 await context.close()
}
await browser.close(); if (process.argv[2]) await writeFile(process.argv[2],JSON.stringify(results,null,2));console.log(JSON.stringify(results))
