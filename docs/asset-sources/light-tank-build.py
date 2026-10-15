# Light tank (plain Bradley, sheet attempt 3) part grading/resizing: mild grade only (no camo),
# premultiplied Lanczos resize, mild unsharp; writes public/images/map/units/lightTank_*.webp.
# Run from the folder holding raw_{wagon,turret,barrel}.png; pass the repo public/images/map/units path as the argument.
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np, json, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/images/map/units'
def grade(im):
  a=im.getchannel('A'); rgb=im.convert('RGB')
  rgb=ImageEnhance.Brightness(rgb).enhance(BRIGHT)
  rgb=ImageEnhance.Color(rgb).enhance(1.05)
  rgb=ImageEnhance.Contrast(rgb).enhance(1.08)
  o=rgb.convert('RGBA'); o.putalpha(a); return o
def rs(im,w,h):
  a=np.asarray(im).astype(float); a[...,:3]*=a[...,3:]/255
  p=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA').resize((w,h),Image.LANCZOS)
  b=np.asarray(p).astype(float); al=b[...,3:]
  b[...,:3]=np.where(al>0,b[...,:3]*255/np.maximum(al,1),0)
  out=Image.fromarray(b.clip(0,255).astype(np.uint8),'RGBA')
  rgb=out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.8,percent=55,threshold=2)).convert('RGBA'); rgb.putalpha(out.getchannel('A')); return rgb
BRIGHT=0.9
W=Image.open('raw_wagon.png'); T=Image.open('raw_turret.png'); B=Image.open('raw_barrel.png')
# Pivot: pad the turret on the right so the image centre is the turret body centre (TOW box hangs off the left).
BODY_CX=171
pad=2*BODY_CX-T.width
Tp=Image.new('RGBA',(T.width+pad,T.height)); Tp.paste(T,(0,0)); T=Tp
B=B.crop((0,int(B.height*0.55),B.width,B.height))  # muzzle-side 45%; breech is hidden under the turret
W,T,B=grade(W),grade(T),grade(B)
S=236/W.height
TS=S*(0.43*W.height/T.height)   # turret length = 43% of hull length
w=rs(W,round(W.width*S),round(W.height*S)); t=rs(T,round(T.width*TS),round(T.height*TS)); b=rs(B,max(9,round(B.width*S)),round(B.height*S))
for n,i in (('wagon',w),('turret',t),('barrel',b)): i.save(f'{OUT}/lightTank_{n}.webp',quality=95,method=6); print(n,i.size)
RING=(140,263)
tm=(round(RING[0]*S),round(RING[1]*S))
gunx=round(160*TS)
bm=(gunx,round(0.9*t.height+b.height/2))
print(json.dumps(dict(turretMountPoint=tm,barrelMountPoint=bm,muzzleFlashOffset=(round(b.width/2),b.height),turretWidthFrac=round(t.width/w.width,2))))
