from PIL import Image,ImageFilter
import numpy as np
from scipy import ndimage
from pathlib import Path
root=Path(__file__).resolve().parents[2]
im=Image.open(root/'docs/asset-sources/recovery-apache-retina-source.webp').convert('RGBA')
# Retain only connected vehicle/blade artwork, removing isolated generation specks.
a=np.array(im)
l,n=ndimage.label(a[:,:,3]>32)
sizes=np.bincount(l.ravel());keep=sizes>3000;keep[0]=False
mask=ndimage.binary_dilation(keep[l],iterations=2)
a[:,:,3]=np.where(mask,a[:,:,3],0)
im=Image.fromarray(a)
for filename,cx,cy,side in [('recovery_tank.webp',401,368,640),('apache_body_map.webp',1083,368,704),('apache_rotor_map.webp',1773,364,560)]:
 part=im.crop((cx-side//2,cy-side//2,cx+side//2,cy+side//2))
 # Pillow RGBa resizes premultiplied alpha, preventing dark edge halos.
 part=part.convert('RGBa').resize((256,256),Image.Resampling.LANCZOS).convert('RGBA')
 alpha=part.getchannel('A')
 part=part.filter(ImageFilter.UnsharpMask(radius=.8,percent=55,threshold=3));part.putalpha(alpha)
 part.save(root/'public/images/map/units'/filename,'WEBP',quality=85,method=6)
