# Howitzer sprite build (desert art): chroma-key the blue Grok Imagine sheet (hull | turret | barrel),
# slightly soften the camouflage contrast, compose the fixed turret onto the hull ring, widen the
# footprint a little, rotate the base 180deg (renderer convention: howitzer base front points UP),
# flip the barrel to muzzle-down and crop its breech/cradle, then save
# public/images/map/units/howitzer_map.webp + howitzer_barrel.webp. Run from the repo root.
from PIL import Image
import numpy as np, json, sys
from scipy import ndimage
SRC='docs/asset-sources/howitzer-desert-spritesheet.jpg'
K=0.85          # luminance contrast factor (1 = unchanged)
WIDEN=1.12      # horizontal footprint factor applied to hull+turret and barrel width
BASE_H=192      # base source height (>= 2x the 3x prepared size of 96 px)
im=np.asarray(Image.open(SRC).convert('RGB')).astype(float)
bg=np.median(np.concatenate([im[:20].reshape(-1,3),im[-20:].reshape(-1,3)]),0)
r,g,b=im[...,0],im[...,1],im[...,2]
blue=b-np.maximum(r,g); bgblue=bg[2]-max(bg[0],bg[1])
a=np.clip((bgblue*0.85-blue)/(bgblue*0.6),0,1)
mask=ndimage.binary_opening(a>0.5,iterations=2)
lab,n=ndimage.label(mask); sizes=ndimage.sum(mask,lab,range(1,n+1))
big=[i+1 for i in np.argsort(sizes)[::-1][:3]]
objs=sorted([(ndimage.find_objects((lab==i).astype(int))[0],i) for i in big],key=lambda t:t[0][1].start)
parts={}
for name,(sl,i) in zip(['hull','turret','barrel'],objs):
  comp=lab==i
  holes=np.zeros_like(comp)
  if name!='hull':   # turret bore / barrel muzzle-brake openings: fill with dark paint
    filled=ndimage.binary_fill_holes(comp); holes=ndimage.binary_dilation(filled&~comp,iterations=1)&filled; comp=filled
  comp=ndimage.binary_dilation(comp,iterations=2)
  al=np.where(comp,a,0); al=np.where(ndimage.binary_erosion(comp,iterations=3),1.0,al)
  aa=np.clip(al,0.05,1)[...,None]
  rgb=np.where((al<0.999)[...,None],(im-(1-aa)*bg)/aa,im).clip(0,255)
  rgb[...,1]=np.minimum(rgb[...,1],rgb[...,0]+4)
  rgb[...,2]=np.minimum(rgb[...,2],rgb[...,1]*0.85+6)      # despill for tan paint
  if holes.any(): rgb[holes]=[48,42,32]; al=np.where(holes,1.0,al)
  ys,xs=np.where(al>0.02); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
  rgb,al=rgb[y0:y1,x0:x1],al[y0:y1,x0:x1]
  lum=rgb@[0.299,0.587,0.114]; m=lum[al>0.9].mean()
  rgb=(rgb*(((m+(lum-m)*K)+1)/(lum+1))[...,None]).clip(0,255)
  parts[name]=(rgb,al)
def img(rgb,al): return Image.fromarray(np.dstack([rgb,al*255]).clip(0,255).astype(np.uint8),'RGBA')
hull=img(*parts['hull']); tur=img(*parts['turret'])
# hull ring = largest dark (open ring interior) blob inside the hull
hrgb,hal=parts['hull']; dark=((hrgb@[0.299,0.587,0.114])<70)&ndimage.binary_erosion(hal>0.9,iterations=8)
hl,_=ndimage.label(ndimage.binary_opening(dark,iterations=2)); hs=ndimage.sum(dark,hl,range(1,hl.max()+1)); ry,rx=ndimage.center_of_mass(hl==np.argmax(hs)+1)
print('ring',round(rx),round(ry),'hull',hal.shape[::-1])
tw,th=tur.size
canvas=hull.copy(); tx,ty=int(round(rx-tw/2)),int(round(ry-th*0.45)); canvas.alpha_composite(tur,(tx,ty))
# mantlet / gun stub tip: lowest opaque row in the turret's centre columns
tm=parts['turret'][1]>0.5; col=tm[:,tw//2-4:tw//2+4].any(1); stub_y=ty+np.where(col)[0].max(); stub_x=tx+tw/2
W,H=canvas.size
base=canvas.rotate(180)
mount=(W-stub_x, H-stub_y+2)             # just inside the stub tip
f=BASE_H/H; bw=round(W*f*WIDEN)
base=base.resize((bw,BASE_H),Image.LANCZOS)
sq=Image.new('RGBA',(BASE_H,BASE_H),(0,0,0,0)); pad=(BASE_H-bw)//2; sq.alpha_composite(base,(pad,0))
# barrel: muzzle brake at top in the sheet -> flip to muzzle down; crop breech/cradle (now at top)
bar=img(*parts['barrel']).transpose(Image.FLIP_TOP_BOTTOM)
ba=np.asarray(bar)[...,3]>128; widths=ba.sum(1); bh=len(widths)
tube=np.median(widths[int(bh*0.35):int(bh*0.6)])
crop=0
for y in range(int(bh*0.6)):                  # last wide (cradle) row in the upper part
  if widths[y]>tube*1.6: crop=y+1
bar=bar.crop((0,crop,bar.width,bh))
bar=bar.resize((max(6,round(bar.width*f*WIDEN)),round(bar.height*f)),Image.LANCZOS)
# trim transparent columns
bb=bar.getchannel('A').getbbox(); bar=bar.crop((bb[0],0,bb[2],bar.height))
sq.save('public/images/map/units/howitzer_map.webp',lossless=True)
bar.save('public/images/map/units/howitzer_barrel.webp',lossless=True)
vb=sq.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
print(json.dumps({'base':sq.size,'vehicle_px':[vb[2]-vb[0],vb[3]-vb[1]],'css_w':round((vb[2]-vb[0])/BASE_H*32,1),
  'barrel':bar.size,'cradle_crop_px':crop,'mount':[round(mount[0]*f*WIDEN+pad - (W*f*WIDEN-bw)/2,1),round(mount[1]*f,1)],
  'barrelMount':[round(bar.width/2,1),0],'muzzle':[round(bar.width/2,1),bar.height]}))
