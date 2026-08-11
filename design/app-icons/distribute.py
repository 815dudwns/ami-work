#!/usr/bin/env python3
import subprocess, os, shutil
GEN="/tmp/gen"; SRC="/tmp/icons_extract/icons/export"; HOME=os.path.expanduser("~")
LAUNCHER={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
FG={'mdpi':108,'hdpi':162,'xhdpi':216,'xxhdpi':324,'xxxhdpi':432}

def rs(src,dst,size):
    shutil.copy(src,dst); subprocess.run(['sips','-z',str(size),str(size),dst],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def android(app, res):
    g=os.path.join(GEN,app)
    for dens,sz in LAUNCHER.items():
        m=os.path.join(res,'mipmap-'+dens); os.makedirs(m,exist_ok=True)
        rs(g+'/composite.png', m+'/ic_launcher.png', sz)
        rs(g+'/composite.png', m+'/ic_launcher_round.png', sz)
        rs(g+'/fg.png', m+'/ic_launcher_foreground.png', FG[dens])
        rs(g+'/bg.png', m+'/ic_launcher_background.png', FG[dens])
    # adaptive xml (배경=mipmap png, 전경=mipmap png)
    adaptive='<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n'
    ad=os.path.join(res,'mipmap-anydpi-v26'); os.makedirs(ad,exist_ok=True)
    open(ad+'/ic_launcher.xml','w').write(adaptive)
    open(ad+'/ic_launcher_round.xml','w').write(adaptive)
    print('android done:',app,res)

android('gigiq', HOME+'/Projects/awms-queue/android/app/src/main/res')
android('amiq',  HOME+'/Projects/ami-queue/android/app/src/main/res')
android('bojo',  HOME+'/Projects/jongno-snap/android/app/src/main/res')

# ---- 웹 PWA ----
def web(app, srcdir, dstdir, extras=False):
    os.makedirs(dstdir,exist_ok=True)
    shutil.copy(srcdir+'/icon-192.png', dstdir+'/icon-192.png')   # fullbleed
    shutil.copy(srcdir+'/icon-512.png', dstdir+'/icon-512.png')   # fullbleed
    shutil.copy(GEN+'/'+app+'/composite.png', dstdir+'/icon-512-maskable.png')  # 안전합성
    if extras:
        shutil.copy(srcdir+'/icon-180.png', dstdir+'/apple-touch-icon.png')
        shutil.copy(srcdir+'/icon-192.png', dstdir+'/icon-192.png')
        shutil.copy(srcdir+'/icon-512.png', dstdir+'/icon-512.png')
        shutil.copy(srcdir+'/icon-32.png',  dstdir+'/favicon-32.png')
    print('web done:',app,dstdir)

web('jongno', SRC+'/3-jongno', HOME+'/Projects/jongno-combined/icons')
web('amimap', SRC+'/4-amiMap', HOME+'/Projects/ami-work/icons', extras=True)
print("DISTRIBUTE DONE")
