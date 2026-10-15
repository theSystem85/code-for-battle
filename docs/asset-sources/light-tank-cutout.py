# Light tank sprite sheet cut-out: chroma-key the blue Grok Imagine background, un-mix blue from
# anti-aliased edge pixels, despill, and save raw_{wagon,turret,barrel}.png (run from the repo root).
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
im=np.asarray(Image.open('docs/asset-sources/light-tank-bradley-spritesheet.jpg').convert('RGB')).astype(float)
bg=np.median(np.concatenate([im[:20].reshape(-1,3),im[-20:].reshape(-1,3)]),0); print('bg',bg)
r,g,b=im[...,0],im[...,1],im[...,2]
# blueness: how much b exceeds max(r,g)
blue=b-np.maximum(r,g)
bgblue=bg[2]-max(bg[0],bg[1])
a=np.clip((bgblue*0.85-blue)/(bgblue*0.85-bgblue*0.25),0,1)  # 1=fg
mask=a>0.5
mask=ndimage.binary_opening(mask,iterations=2)
lab,n=ndimage.label(mask); sizes=ndimage.sum(mask,lab,range(1,n+1))
big=[i+1 for i in np.argsort(sizes)[::-1][:3]]
objs=sorted([(ndimage.find_objects((lab==i).astype(int))[0],i) for i in big],key=lambda t:t[0][1].start)
for name,(sl,i) in zip(['wagon','turret','barrel'],objs):
  comp=ndimage.binary_fill_holes(lab==i)
  comp=ndimage.binary_dilation(comp,iterations=2)
  al=np.where(comp,a,0)
  al=np.where(ndimage.binary_erosion(comp,iterations=3),1.0,al)
  rgb=im.copy()
  aa=np.clip(al,0.05,1)[...,None]
  rgb=np.where((al<0.999)[...,None],(im-(1-aa)*bg)/aa,im).clip(0,255)
  # despill: clamp blue to max(r,g)+small
  rgb[...,2]=np.minimum(rgb[...,2],np.maximum(rgb[...,0],rgb[...,1])+6)
  ys,xs=np.where(al>0.02); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
  out=np.dstack([rgb,al*255])[y0:y1,x0:x1].clip(0,255).astype(np.uint8)
  Image.fromarray(out,'RGBA').save(f'raw_{name}.png'); print(name,out.shape,(x0,y0))
