#!/usr/bin/env python3
"""
Génère les fichiers de marque ZeeRoo dans assets/images/ à partir de la planche de logos
(assets/brand/zeeroo-logos.png) : logo clair et sombre, symbole Z, icônes iOS et Android,
écran de lancement et favicon.

Usage : python3 scripts/brand-assets.py   (nécessite Pillow et NumPy)

Les logos sont détourés (fond blanc rendu transparent), agrandis puis recolorés en aplats :
vert ZeeRoo #3AAD17 et encre #0B1C1C. Quand le graphiste livrera les SVG, les utiliser à la place.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT / 'assets/images')
from PIL import Image, ImageFilter
import numpy as np
src=Image.open(ROOT / 'assets/brand/zeeroo-logos.png').convert('RGB')
def region(box):
    a=np.asarray(src.crop(box)).astype(float)
    m=(a.min(axis=2)<235)
    ys,xs=np.where(m); pad=6
    return src.crop((box[0]+xs.min()-pad,box[1]+ys.min()-pad,box[0]+xs.max()+pad,box[1]+ys.max()+pad))
def unwhite(im,scale=1):
    if scale!=1: im=im.resize((im.width*scale,im.height*scale),Image.LANCZOS)
    a=np.asarray(im).astype(float)
    al=(255-a.min(axis=2))/255.0
    # re-sharpen edges (flat colour artwork)
    al=np.clip((al-0.5)*(2.2 if scale>1 else 1.0)+0.5,0,1) if scale>1 else al
    col=np.where(al[...,None]>0.01,(a-255*(1-np.clip((255-a.min(axis=2))/255.0,1e-3,1))[...,None])/np.clip((255-a.min(axis=2))/255.0,1e-3,1)[...,None],0)
    col=np.clip(col,0,255)
    out=np.dstack([col,al*255]).astype(np.uint8)
    return Image.fromarray(out,'RGBA')
S=1086/1000
logo=region((int(55*S),int(30*S),int(1060*S),int(300*S)))
mark=region((int(395*S),int(405*S),int(705*S),int(595*S)))
L=unwhite(logo,2); M=unwhite(mark,4)
# classify ink vs green
def recolor(im,ink,green):
    a=np.asarray(im).astype(float); g=(a[...,1]>a[...,0]+40)
    out=a.copy(); out[...,:3]=np.where(g[...,None],green,ink); return Image.fromarray(out.astype(np.uint8),'RGBA')
GREEN=(0x3A,0xAD,0x17); INK=(0x0B,0x1C,0x1C)
L=recolor(L,INK,GREEN); M=recolor(M,INK,GREEN)
L.save('logo.png'); recolor(L,(255,255,255),GREEN).save('logo-dark.png')
M.save('logo-mark.png')
print('logo',L.size,'mark',M.size)
def place(mask,size,frac,color,bg=None,dy=0):
    m=mask.copy(); w=int(size*frac); h=int(m.height*w/m.width)
    m=m.resize((w,h),Image.LANCZOS)
    a=np.asarray(m)[...,3]
    fg=Image.new('RGBA',(w,h),color+(255,)); fg.putalpha(Image.fromarray(a))
    c=Image.new('RGBA',(size,size),(bg+(255,)) if bg else (0,0,0,0))
    c.alpha_composite(fg,((size-w)//2,(size-h)//2+dy)); return c
W=(255,255,255)
place(M,1024,0.62,W,GREEN).convert('RGB').save('icon.png')
place(M,1024,0.42,W).save('android-icon-foreground.png')
Image.new('RGB',(1024,1024),GREEN).save('android-icon-background.png')
place(M,1024,0.42,(0,0,0)).save('android-icon-monochrome.png')
# favicon : tuile verte arrondie
f=place(M,256,0.66,W,GREEN); r=Image.new('L',(256,256),0)
from PIL import ImageDraw; ImageDraw.Draw(r).rounded_rectangle((0,0,255,255),56,fill=255); f.putalpha(r); f.resize((48,48),Image.LANCZOS).save('favicon.png')
# splash : logo complet centré
sp=Image.new('RGBA',(1200,1200),(0,0,0,0)); l=L.resize((1100,int(L.height*1100/L.width)),Image.LANCZOS); sp.alpha_composite(l,(50,(1200-l.height)//2)); sp.save('splash-icon.png')
spd=Image.new('RGBA',(1200,1200),(0,0,0,0)); ld=recolor(l,(255,255,255),GREEN); spd.alpha_composite(ld,(50,(1200-l.height)//2)); spd.save('splash-icon-dark.png')
