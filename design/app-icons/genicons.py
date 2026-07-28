#!/usr/bin/env python3
# 4앱(+보조앱) 아이콘 생성: 안드로이드 adaptive(bg/fg 분리) + 웹 PWA(maskable=안전합성)
import subprocess, os, shutil
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="/tmp/icons_extract/icons/export"
GEN="/tmp/gen"; os.makedirs(GEN,exist_ok=True)
S=0.74  # 전경 안전존 스케일 (gigiQ 프리뷰로 확정)

def render(svg,out,size):
    html='<!doctype html><meta charset=utf-8><style>*{margin:0;padding:0}html,body{background:transparent}</style>'+svg
    hp=out+'.html'; open(hp,'w').write(html)
    subprocess.run([CHROME,'--headless=new','--disable-gpu','--screenshot='+out,
        '--window-size=%d,%d'%(size,size),'--default-background-color=00000000',
        '--hide-scrollbars','file://'+hp],stderr=subprocess.DEVNULL)

def svg(defs,inner):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">%s%s</svg>'%(defs,inner)

def fgwrap(inner):
    return '<g transform="translate(256,256) scale(%s) translate(-256,-256)">%s</g>'%(S,inner)

def resize(src,dst,size):
    shutil.copy(src,dst)
    subprocess.run(['sips','-z',str(size),str(size),dst],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

# ---- 디자인 정의 ----
TXT=lambda t,fs:'<text x="430" y="450" font-size="%d" letter-spacing="-2" font-weight="800" text-anchor="end" font-family="-apple-system,Malgun Gothic,AppleGothic,sans-serif" fill="#000" opacity="0.2" transform="translate(2,3)">%s</text><text x="430" y="450" font-size="%d" letter-spacing="-2" font-weight="800" text-anchor="end" font-family="-apple-system,Malgun Gothic,AppleGothic,sans-serif" fill="#fff">%s</text>'%(fs,t,fs,t)

DESIGNS={}
# 계기큐 gm
DESIGNS['gigiq']=dict(
 defs='<defs><linearGradient id="gm" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512"><stop offset="0" stop-color="#F6AE2D"/><stop offset="1" stop-color="#E07C0E"/></linearGradient><linearGradient id="shm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>',
 bg='<rect width="512" height="512" fill="url(#gm)"/><rect width="512" height="512" fill="url(#shm)"/>',
 fg='<circle cx="256" cy="210" r="112" fill="#fff"/><g stroke="#E07C0E" stroke-width="11" stroke-linecap="round"><line x1="181.5" y1="167.0" x2="166.8" y2="158.5"/><line x1="213.0" y1="135.5" x2="204.5" y2="120.8"/><line x1="256.0" y1="124.0" x2="256.0" y2="107.0"/><line x1="299.0" y1="135.5" x2="307.5" y2="120.8"/><line x1="330.5" y1="167.0" x2="345.2" y2="158.5"/></g><path d="M276 146 L212 226 L252 226 L236 288 L312 200 L264 200 Z" fill="#8A4A0C"/>'+TXT('계기큐',64),
 src=SRC+'/1-gigiQ')
# 아미큐 ga
DESIGNS['amiq']=dict(
 defs='<defs><linearGradient id="ga" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512"><stop offset="0" stop-color="#2E8BE6"/><stop offset="1" stop-color="#1559C4"/></linearGradient><linearGradient id="sha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>',
 bg='<rect width="512" height="512" fill="url(#ga)"/><rect width="512" height="512" fill="url(#sha)"/>',
 fg='<g fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"><path d="M222.2 190.6 A40 40 0 0 1 289.8 190.6"/><path d="M195.2 173.4 A72 72 0 0 1 316.8 173.4"/></g><circle cx="256" cy="212" r="13" fill="#fff"/><line x1="256" y1="218" x2="256" y2="270" stroke="#fff" stroke-width="14" stroke-linecap="round"/><rect x="176" y="270" width="160" height="86" rx="20" fill="#fff"/><circle cx="208" cy="313" r="10" fill="#1559C4"/><circle cx="240" cy="313" r="10" fill="#1559C4" opacity=".45"/><rect x="266" y="305" width="50" height="16" rx="8" fill="#1559C4"/>'+TXT('아미큐',64),
 src=SRC+'/2-amiQ')
# 종로맵 gj (웹)
JDEFS='<defs><linearGradient id="gj" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512"><stop offset="0" stop-color="#8163F2"/><stop offset="1" stop-color="#5836CC"/></linearGradient><linearGradient id="shj" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
JBG='<rect width="512" height="512" fill="url(#gj)"/><rect width="512" height="512" fill="url(#shj)"/><g opacity="0.6" transform="translate(256,300) scale(0.92,0.76)"><clipPath id="zc"><path d="M-200 40 L200 40 L200 -258 Q0 -182 -200 -258 Z"/></clipPath><path d="M-200 40 L200 40 L200 -258 Q0 -182 -200 -258 Z" fill="#fff" opacity="0.13"/><g clip-path="url(#zc)"><path d="M-340 40 A340 340 0 0 1 340 40 Z" fill="#fff" opacity="0.44"/><path d="M-288 40 A288 288 0 0 1 288 40 Z" fill="#fff" opacity="0.2"/><path d="M-236 40 A236 236 0 0 1 236 40 Z" fill="#fff" opacity="0.44"/><path d="M-184 40 A184 184 0 0 1 184 40 Z" fill="#fff" opacity="0.2"/><path d="M-132 40 A132 132 0 0 1 132 40 Z" fill="#fff" opacity="0.44"/><path d="M-80 40 A80 80 0 0 1 80 40 Z" fill="#fff" opacity="0.2"/></g></g><path d="M224.72 330.40 L224.72 275.68 A31.28 25.84 0 0 1 287.28 275.68 L287.28 330.40 Z" fill="url(#gj)"/>'
JPIN='<circle cx="176" cy="222" r="72" fill="#fff"/><path d="M124.16 258 L176 364.56 L227.84 258 Z" fill="#fff"/><circle cx="176" cy="222" r="30.2" fill="#5836CC"/>'
DESIGNS['jongno']=dict(defs=JDEFS,bg=JBG,fg=JPIN+TXT('종로',78),src=SRC+'/3-jongno')
# 보조앱 (안드로이드) = 종로 + 보조앱 라벨
DESIGNS['bojo']=dict(defs=JDEFS,bg=JBG,fg=JPIN+TXT('보조앱',58),src=SRC+'/3-jongno')
# 아미맵 gs (웹)
DESIGNS['amimap']=dict(
 defs='<defs><linearGradient id="gs" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512"><stop offset="0" stop-color="#18C28D"/><stop offset="1" stop-color="#0C9266"/></linearGradient><linearGradient id="shs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>',
 bg='<rect width="512" height="512" fill="url(#gs)"/><rect width="512" height="512" fill="url(#shs)"/><g stroke="#fff" stroke-opacity="0.15" fill="none" stroke-width="16" stroke-linecap="round"><path d="M-10 170 H522"/><path d="M-10 332 H522"/><path d="M150 -10 V300"/><path d="M362 214 V522"/><path d="M-10 92 L214 300"/></g><g fill="#fff" fill-opacity="0.06"><rect x="170" y="190" width="176" height="126" rx="12"/><rect x="386" y="36" width="120" height="122" rx="12"/></g>',
 fg='<circle cx="256" cy="212" r="94" fill="#fff"/><path d="M188.32 259 L256 398.12 L323.68 259 Z" fill="#fff"/><circle cx="256" cy="212" r="39.5" fill="#0C9266"/>'+TXT('KDN',78),
 src=SRC+'/4-amiMap')

# ---- 베이스 레이어 렌더 (고해상도 1회 후 sips 다운스케일) ----
for name,d in DESIGNS.items():
    o=os.path.join(GEN,name); os.makedirs(o,exist_ok=True)
    # 안전합성(maskable/legacy): bg + 스케일fg
    render(svg(d['defs'],d['bg']+fgwrap(d['fg'])), o+'/composite.png', 512)
    # adaptive 레이어 (안드로이드만 필요하지만 전부 렌더해둠)
    render(svg(d['defs'],d['bg']), o+'/bg.png', 432)
    render(svg(d['defs'],fgwrap(d['fg'])), o+'/fg.png', 432)
    print('rendered',name)
print("BASE DONE")
