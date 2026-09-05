// Offline-only compiler for shore/SOT masks and neutral connected cliff art.
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
const dir = new URL('../public/images/terrain/', import.meta.url)
const layers = []
const terrain = await sharp(new URL('organic-atlas.png',dir).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true})
function material(x,y,road=false) {
 const sx=road? (x&31)*2 : (x&255)*2, sy=road?512+Math.floor(46*4/16)*80+8+(y&31)*2 : (y&255)*2
 // Road interior is sampled from the original source, below, instead of mask atlas.
 const i=(sy*terrain.info.width+sx)*4
 return terrain.data.subarray(i,i+3)
}
const roadSource=await sharp(new URL('source/materials.png',dir).pathname).metadata()
const road=await sharp(new URL('source/materials.png',dir).pathname).extract({left:0,top:Math.floor(roadSource.height/2),width:roadSource.width,height:Math.floor(roadSource.height/2)}).resize(128,128).removeAlpha().raw().toBuffer()
function color(x,y,isRoad=false) {return isRoad?road.subarray((((y&127)*128)+(x&127))*3,(((y&127)*128)+(x&127))*3+3):material(x,y)}
async function addPixels(pixels,width,height,left,top) {layers.push({input:await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),left,top})}
const cornerUV=(corner,x,y)=>[corner===1||corner===2?31-x:x,corner>=2?31-y:y]
// Triangles: only hypotenuse fades. The two legs remain fully covered.
for(let kind=0;kind<2;kind++)for(let corner=0;corner<4;corner++)for(let variant=0;variant<4;variant++) {
 const p=Buffer.alloc(32*32*4)
 for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
  const [u,v]=cornerUV(corner,x,y)
  const wiggle=Math.sin((u-v)*0.65)*Math.sin(Math.PI*u/31)*0.8
  const alpha=u===0||v===0?1:Math.max(0,Math.min(1,(32-u-v+wiggle)/1.8))
  const rgb=color(x+variant*32,y+variant*17,kind===1),i=(y*32+x)*4
  for(let c=0;c<3;c++)p[i+c]=rgb[c]
  p[i+3]=Math.round(alpha*255)
 }
 await addPixels(p,32,32,(corner*4+variant)*32,kind*32)
}
// Water-side coast lips: opaque joins at ground neighbors, rough exposed edge.
for(let kind=0;kind<2;kind++)for(let mask=0;mask<16;mask++) {
 const p=Buffer.alloc(32*32*4)
 for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
  const wave=t=>3.2+Math.sin(t*.43)*1.0+Math.sin(t*.91)*.35
  let d=-10
  if(mask&1)d=Math.max(d,wave(x)-y)
  if(mask&2)d=Math.max(d,wave(y)-(31-x))
  if(mask&4)d=Math.max(d,wave(x)-(31-y))
  if(mask&8)d=Math.max(d,wave(y)-x)
  const rgb=color(x,y,kind===1),i=(y*32+x)*4
  for(let c=0;c<3;c++)p[i+c]=rgb[c]*(d<1?[.87,.89,.85][c]:1)
  p[i+3]=Math.round(255*Math.max(0,Math.min(1,(d+1)/2)))
 }
 await addPixels(p,32,32,mask*32,64+kind*32)
}
// Land-side of water SOT: a thin neutral/ground bank covers the old hard cut,
// without touching either connected leg. The water's animation stays intact.
for(let kind=0;kind<2;kind++)for(let corner=0;corner<4;corner++) {
 const p=Buffer.alloc(32*32*4)
 for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
  const [u,v]=cornerUV(corner,x,y),d=u+v-32
  const wobble=.7*Math.sin((u-v)*.63)*Math.sin(Math.PI*u/31)
  const alpha=d>3?0:Math.max(0,Math.min(1,(d+2+wobble)/2))
  const rgb=color(x,y,kind===1),i=(y*32+x)*4
  for(let c=0;c<3;c++)p[i+c]=rgb[c]
  p[i+3]=Math.round(alpha*255)
 }
 await addPixels(p,32,32,corner*32,128+kind*32)
}
async function cropSheet(name,cols,rows) {
 const path=new URL(`source/${name}.png`,dir).pathname,m=await sharp(path).metadata(),out=[]
 for(let i=0;i<cols*rows;i++) {
  const b=await sharp(path).extract({left:Math.floor(i%cols*m.width/cols),top:Math.floor(Math.floor(i/cols)*m.height/rows),width:Math.floor(m.width/cols),height:Math.floor(m.height/rows)}).png().toBuffer()
  out.push(await sharp(b).trim({threshold:8}).png().toBuffer())
 }
 return out
}
const decorations=await cropSheet('decoration',4,3)
for(let i=0;i<12;i++)layers.push({input:await sharp(decorations[i]).resize(32,32,{fit:'contain',background:'#00000000'}).png().toBuffer(),left:i*32,top:192})
// Generated sprites have unequal gutters; explicit reviewed bounds avoid
// accidentally packing fragments of neighboring sprites.
const bounds=JSON.parse(await readFile(new URL('source/cliffs-layout.json',dir),'utf8'))
const cliffs=await Promise.all(bounds.map(async rect=>{
 const b=await sharp(new URL('source/cliffs.png',dir).pathname).extract(rect).png().toBuffer()
 return sharp(b).trim({threshold:8}).png().toBuffer()
}))
// Draw-direction-specific samples retain the generated lighting (no rotations).
const sizes=[[60,44],[44,60],[60,60],[60,60]]
const strips=await Promise.all(cliffs.slice(0,4).map((b,i)=>sharp(b).resize(...sizes[i],{fit:'fill'}).ensureAlpha().raw().toBuffer()))
const center=await sharp(cliffs[0]).resize(28,22,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const dirs=[[0,-1,1],[1,0,0],[0,1,1],[-1,0,0],[1,-1,2],[1,1,3],[-1,1,2],[-1,-1,3]]
for(let mask=0;mask<256;mask++)for(let variant=0;variant<2;variant++) {
 const p=Buffer.alloc(64*64*4)
 function over(data,w,h,ox,oy,accept=()=>true) {
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
   const tx=x+ox,ty=y+oy;if(tx<0||ty<0||tx>=64||ty>=64||!accept(tx,ty))continue
   const i=(ty*64+tx)*4,j=(y*w+x)*4,a=data[j+3]/255,old=p[i+3]/255,out=a+old*(1-a)
   if(!out)continue
   for(let c=0;c<3;c++)p[i+c]=Math.round((data[j+c]*a+p[i+c]*old*(1-a))/out)
   p[i+3]=Math.round(out*255)
  }
 }
 for(let k=0;k<8;k++)if(mask&(1<<k)) {
  const [dx,dy,s]=dirs[k],[w,h]=sizes[s]
  over(strips[s],w,h,Math.floor((64-w)/2),Math.floor((64-h)/2),(x,y)=>(x-32)*dx+(y-32)*dy>=-3)
 }
 if (!mask) over(center,28,22,18,21)
 // Extremely subtle alternate tone, no baked biome colors or ground discs.
 if(variant)for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)p[i+c]=Math.round(p[i+c]*.96)
 await addPixels(p,64,64,(mask%16)*64,256+(Math.floor(mask/16)*2+variant)*64)
}
// Isolated formations: neutral stone only, all biomes share this same set.
const boulders=await cropSheet('boulders',3,2)
for(let i=0;i<6;i++) {
 const b=boulders[i]
 layers.push({input:await sharp(b).resize(40+(i%3)*4,40,{fit:'contain',background:'#00000000'}).extend({top:0,bottom:8,left:0,right:8-(i%3)*4,background:'#00000000'}).png().toBuffer(),left:i*48,top:2304})
}
await sharp({create:{width:1024,height:2352,channels:4,background:'#00000000'}}).composite(layers).png().toFile(new URL('terrain-details.png',dir).pathname)
await writeFile(new URL('terrain-details.json',dir),JSON.stringify({version:2,trianglesY:[0,32],coastsY:[64,96],banksY:[128,160],decorationsY:192,cliffsY:256,cliffCell:64,cliffVariants:2,cliffMasks:256,isolatedY:2304,isolatedCell:48},null,2)+'\n')
