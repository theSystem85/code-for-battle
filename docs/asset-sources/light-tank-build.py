# Light tank part grading/resizing: match the tank V1 palette, premultiplied Lanczos resize, mild unsharp,
# write public/images/map/units/lightTank_*.webp and print mount points. Then run npm run make:prepared-sprites.
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np, json
def grade(im):
  a=im.getchannel('A'); rgb=im.convert('RGB')
  rgb=ImageEnhance.Brightness(rgb).enhance(1.2)
  rgb=ImageEnhance.Color(rgb).enhance(1.2)
  rgb=ImageEnhance.Contrast(rgb).enhance(1.1)
  o=rgb.convert('RGBA'); o.putalpha(a); return o
def rs(im,w,h):
  # premultiplied lanczos to avoid dark fringes
  a=np.asarray(im).astype(float); a[...,:3]*=a[...,3:]/255
  p=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA').resize((w,h),Image.LANCZOS)
  b=np.asarray(p).astype(float); al=b[...,3:]
  b[...,:3]=np.where(al>0,b[...,:3]*255/np.maximum(al,1),0)
  out=Image.fromarray(b.clip(0,255).astype(np.uint8),'RGBA')
  rgb=out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.8,percent=60,threshold=2)).convert('RGBA'); rgb.putalpha(out.getchannel('A')); return rgb
S=0.4
W=grade(Image.open('raw_wagon.png')); T=grade(Image.open('raw_turret.png')); B=grade(Image.open('raw_barrel.png'))
B=B.crop((0,int(B.height*0.4),B.width,B.height))  # keep muzzle 60%, breech hidden under turret
TS=S*0.85
w=rs(W,round(W.width*S),round(W.height*S)); t=rs(T,round(T.width*TS),round(T.height*TS)); b=rs(B,max(9,round(B.width*S)),round(B.height*S))
for n,i in (('wagon',w),('turret',t),('barrel',b)): i.save(f'public/images/map/units/lightTank_{n}.webp',quality=95,method=6); print(n,i.size)
# mounts: hull turret-ring center ~ (156,280) in raw; turret mantlet at bottom-centre (146, ~332 of 344)
tm=(round(156*S),round(280*S))
mantY=0.95*t.height
bm=(round(t.width/2),round(mantY+b.height/2-4))
cfg=dict(turretMountPoint=tm,barrelMountPoint=bm,muzzleFlashOffset=(round(b.width/2),b.height))
print(json.dumps(cfg))
