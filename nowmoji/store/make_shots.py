import asyncio, json, urllib.request, base64, sys, math
from playwright.async_api import async_playwright
LANG=sys.argv[1]; JA=LANG=='ja'
ICON=base64.b64encode(open('/home/claude/tabi-shiori/nowmoji/assets/icon.png','rb').read()).decode()
ART={m:base64.b64encode(open(f'/home/claude/tabi-shiori/nowmoji/assets/m/{m}.png','rb').read()).decode() for m in ['happy','miss','sleepy','work']}
def call(t,m,p,b=None):
    r=urllib.request.Request('http://127.0.0.1:3999'+p,method=m,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+t} if t else {})})
    return json.loads(urllib.request.urlopen(r).read())
NAMES=['ゆき','れん','みお','そら','はる'] if JA else ['Yuki','Ren','Mio','Sora','Haru']
G=('いつもの5人' if JA else 'Besties')
POSTS=[('kao','sleepy','ねむい〜' if JA else 'so sleepy~'),('art','happy','テスト終わった！' if JA else 'exam done!'),('kao','eat','駅前のパン屋さん' if JA else 'found a cute bakery'),('art','miss',''),('kao','work','あと少し' if JA else 'almost there')]
CAPS={'ja':[('いまの気分を','親しい人だけに'),('顔文字でも、','かわいいキャラでも'),('相手のロック画面に','そっと届く'),('落書きや写真も','四角いスタンプで'),('その日の流れは','カレンダーで'),('ホーム画面には','4人の気分を大きく')],
      'en':[('Your mood right now,','only for close friends'),('Kaomoji or','cute characters'),('Lands quietly on','their lock screen'),('Doodles and photos','as square stickers'),('Look back on the day','in the calendar'),('Your home screen shows','4 friends up close')]}[LANG]
COLS=[('#FF9A7A','#FFC2A8'),('#F7A8C4','#FFD3E2'),('#8FB8F0','#C9DDF7'),('#9AD6B8','#CDEBDC'),('#F5C26B','#FBE0AE'),('#B7A4F2','#DCD2FA')]
FONT="Inter,'Noto Sans CJK JP',sans-serif"
KF="'Noto Sans CJK JP',sans-serif"

def status(dark, show_time=True):
    fg='#fff' if dark else '#000'
    return f"""<div style="position:absolute;left:0;top:0;width:390px;height:54px;z-index:5;font-family:{FONT};color:{fg}">
<div style="position:absolute;left:0;width:150px;top:17px;text-align:center;font-weight:600;font-size:17px;letter-spacing:-.2px">{'9:41' if show_time else ''}</div>
<div style="position:absolute;right:0;width:150px;top:19px;display:flex;justify-content:center;align-items:center;gap:6px">
<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="{fg}"/><rect x="5.2" y="5.5" width="3.2" height="6.5" rx="1" fill="{fg}"/><rect x="10.4" y="3" width="3.2" height="9" rx="1" fill="{fg}"/><rect x="15.6" y="0" width="3.2" height="12" rx="1" fill="{fg}"/></svg>
<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 11.6l2.5-2.6a3.6 3.6 0 0 0-5 0z" fill="{fg}"/><path d="M3.9 6.7a6.6 6.6 0 0 1 9.2 0l1.5-1.6a8.8 8.8 0 0 0-12.2 0z" fill="{fg}"/><path d="M.9 3.6a10.9 10.9 0 0 1 15.2 0L17 2.6A12.2 12.2 0 0 0 0 2.6z" fill="{fg}"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="{fg}" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="{fg}"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="{fg}" fill-opacity=".45"/></svg></div></div>
<div style="position:absolute;left:132px;top:11px;width:126px;height:37px;border-radius:20px;background:#000;z-index:6"></div>"""

def indicator(dark): return f'<div style="position:absolute;left:125px;bottom:8px;width:140px;height:5px;border-radius:3px;background:{"#fff" if dark else "#000"};z-index:6"></div>'

WALL="""<div style="position:absolute;inset:0;background:linear-gradient(165deg,#3B2D63 0%,#7A4E8F 38%,#E58E7A 74%,#F6C68E 100%)"></div>
<div style="position:absolute;width:420px;height:420px;left:-120px;top:120px;border-radius:50%;background:radial-gradient(circle,#FF9DB6 0,transparent 65%);opacity:.55;filter:blur(10px)"></div>
<div style="position:absolute;width:380px;height:380px;right:-140px;top:420px;border-radius:50%;background:radial-gradient(circle,#8EC5FF 0,transparent 65%);opacity:.45;filter:blur(10px)"></div>"""

PEOPLE=[(n,c) for n,c in zip(NAMES,['#E58B6B','#5AA39B','#C98BB5','#6C9BD2','#D9A441'])]
def tint(h,a=.17):
    n=int(h[1:],16);m=lambda c:round(c*a+255*(1-a));return '#%02x%02x%02x'%(m(n>>16),m((n>>8)&255),m(n&255))
KAO={'sleepy':'(´-ω-`)zz','miss':'(っ´ω`c)♡','work':'(ง`ω´)ง','eat':'(*´ч`*)','happy':'(*´▽`*)'}
def kaobox(k,size):
    w=sum(1 if ord(ch)>0x2000 else .62 for ch in k); fs=min(size*.3,(size-10)*.94/w)
    return f'<span style="font:800 {fs:.1f}px {KF};color:#2B2633;white-space:nowrap">{k}</span>'

def lockscreen():
    you='あなた' if JA else 'You'
    date='11月25日 水曜日' if JA else 'Wednesday, November 25'
    fit=lambda k,w,mx:min(mx,w*.94/sum(1 if ord(ch)>0x2000 else .62 for ch in k))
    cells=[(you,KAO['miss']),(NAMES[2],KAO['eat']),(NAMES[1],KAO['work'])]
    rect=''.join(f'<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="height:20px;display:flex;align-items:center;font:800 {fit(k,44,14):.1f}px {KF};white-space:nowrap">{k}</div><div style="font:600 10px {FONT}">{n}</div></div>' for n,k in cells)
    circ=lambda n,k:f'<div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.18);backdrop-filter:blur(20px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px"><div style="font:800 {fit(k,58,15):.1f}px {KF};white-space:nowrap">{k}</div><div style="font:600 9px {FONT}">{n}</div></div>'
    btn=lambda svg:f'<div style="width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.18);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:center">{svg}</div>'
    torch='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M8 2h8v4l-2 4v12h-4V10L8 6z"/><path d="M12 13v3"/></svg>'
    cam='<svg width="24" height="22" viewBox="0 0 24 22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="12" r="4"/></svg>'
    return f"""{WALL}{status(True,False)}
<div style="position:absolute;left:0;right:0;top:72px;text-align:center;color:#fff;font:600 21px {FONT}">{date}</div>
<div style="position:absolute;left:0;right:0;top:92px;text-align:center;color:#fff;font:700 104px/1 {FONT};letter-spacing:-3px;opacity:.96">9:41</div>
<div style="position:absolute;left:26px;right:26px;top:212px;display:flex;gap:10px;color:#fff">
<div style="width:158px;height:72px;border-radius:18px;background:rgba(255,255,255,.18);backdrop-filter:blur(20px);padding:7px 8px;box-sizing:border-box;display:flex;flex-direction:column;gap:3px"><div style="font:800 11px {FONT}">{G} <span style="opacity:.7">+2</span></div><div style="display:flex">{rect}</div></div>
{circ(you,KAO['miss'])}{circ(NAMES[1],KAO['work'])}</div>
<div style="position:absolute;left:46px;right:46px;bottom:46px;display:flex;justify-content:space-between">{btn(torch)}{btn(cam)}</div>{indicator(True)}"""

APPS_JA=['カメラ','写真','マップ','天気','時計','メモ','Nowmoji','設定']
APPS_EN=['Camera','Photos','Maps','Weather','Clock','Notes','Nowmoji','Settings']
GLYPH=['<circle cx="12" cy="13" r="5" fill="none" stroke="#fff" stroke-width="2"/><rect x="4" y="7" width="16" height="12" rx="3" fill="none" stroke="#fff" stroke-width="2"/>',
 '<circle cx="12" cy="12" r="6" fill="#fff" opacity=".9"/>','<path d="M5 18l4-12 6 8 4-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
 '<circle cx="10" cy="10" r="4" fill="#FFD45C"/><path d="M8 17h9a3 3 0 0 0 0-6 4 4 0 0 0-7.6 1A2.5 2.5 0 0 0 8 17z" fill="#fff"/>','<circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 8v4l3 2" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>',
 '<rect x="6" y="5" width="12" height="14" rx="2" fill="#fff"/><path d="M8.5 9h7M8.5 12h7M8.5 15h4" stroke="#C9A95B" stroke-width="1.5"/>','', '<circle cx="12" cy="12" r="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.3 6.3l1.8 1.8M15.9 15.9l1.8 1.8M6.3 17.7l1.8-1.8M15.9 8.1l1.8-1.8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>']
BGS=['linear-gradient(#5d5d66,#3a3a42)','linear-gradient(#ffb36b,#f06d8c)','linear-gradient(#6fd1a0,#3c9bd6)','linear-gradient(#5aa7f0,#2f6fd6)','linear-gradient(#3a3a42,#1c1c22)','linear-gradient(#ffe48a,#f7c948)','','linear-gradient(#9aa0a8,#6a7079)']
def icon(i,label):
    if i==6: inner=f'<img src="data:image/png;base64,{ICON}" style="width:62px;height:62px;border-radius:14px;display:block">'
    else: inner=f'<div style="width:62px;height:62px;border-radius:14px;background:{BGS[i]};display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24">{GLYPH[i]}</svg></div>'
    lab=f'<div style="font:500 11.5px {FONT};color:#fff;margin-top:5px;text-shadow:0 1px 2px rgba(0,0,0,.25)">{label}</div>' if label else ''
    return f'<div style="display:flex;flex-direction:column;align-items:center;width:72px">{inner}{lab}</div>'

def homescreen():
    you='あなた' if JA else 'You'
    fr=[(NAMES[0],PEOPLE[0][1],KAO['sleepy'],'たった今' if JA else 'just now'),(NAMES[2],PEOPLE[2][1],KAO['eat'],'12分前' if JA else '12m ago'),(NAMES[1],PEOPLE[1][1],'ART','1時間前' if JA else '1h ago'),(NAMES[3],PEOPLE[3][1],KAO['work'],'3時間前' if JA else '3h ago')]
    def cell(n,c,k,t):
        box=f'<img src="data:image/png;base64,{ART["happy"]}" style="width:54px;height:54px">' if k=='ART' else kaobox(k,72)
        return f'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:100%;height:66px;border-radius:15px;background:{tint(c)};display:flex;align-items:center;justify-content:center;overflow:hidden">{box}</div><div style="font:800 12px {FONT};color:{c}">{n}</div><div style="font:500 9.5px {FONT};color:#8A8396">{t}</div></div>'
    med=f"""<div style="position:absolute;left:20px;right:20px;top:68px;height:170px;border-radius:24px;background:#FFFDF8;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:13px 14px;box-sizing:border-box">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font:800 13px {FONT};color:#8A8396">{G}</div><div style="display:flex;align-items:center;gap:4px;border-radius:99px;background:{tint('#7C6BC4')};padding:2px 8px"><span style="font:800 10px {KF};color:#2B2633">{KAO['miss']}</span><span style="font:700 9.5px {FONT};color:#2B2633">{you}</span></div></div>
<div style="display:flex;gap:8px">{''.join(cell(*x) for x in fr)}</div></div>"""
    small=f"""<div style="position:absolute;left:20px;top:258px;width:170px;height:170px;border-radius:24px;background:{tint(PEOPLE[4][1],.22)};box-shadow:0 8px 24px rgba(0,0,0,.18);padding:13px;box-sizing:border-box;display:flex;flex-direction:column">
<div style="font:800 14px {FONT};color:{PEOPLE[4][1]}">{NAMES[4]}</div><div style="flex:1;display:flex;align-items:center;justify-content:center"><img src="data:image/png;base64,{ART['miss']}" style="width:86px;height:86px"></div><div style="font:500 12px {KF};color:#2B2633">{'早く会いたいな' if JA else 'see you soon!'}</div><div style="font:500 10px {FONT};color:#8A8396">21:05</div></div>"""
    labels=APPS_JA if JA else APPS_EN
    grid=''.join(icon(i,labels[i]) for i in [0,1,2,3])
    grid2=''.join(icon(i,labels[i]) for i in [4,5])
    dock=''.join(icon(i,'') for i in [7,6,1,0])
    return f"""{WALL}{status(True)}{med}{small}
<div style="position:absolute;left:206px;top:262px;display:grid;grid-template-columns:repeat(2,72px);gap:18px 10px">{grid2}{icon(6,labels[6])}{icon(7,labels[7])}</div>
<div style="position:absolute;left:23px;right:23px;top:456px;display:flex;justify-content:space-between">{grid}</div>
<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:128px;padding:7px 14px;border-radius:99px;background:rgba(255,255,255,.22);backdrop-filter:blur(20px);color:#fff;font:600 13px {FONT};display:flex;gap:5px;align-items:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"><circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5" stroke-linecap="round"/></svg>{'検索' if JA else 'Search'}</div>
<div style="position:absolute;left:12px;right:12px;bottom:12px;height:96px;border-radius:34px;background:rgba(255,255,255,.22);backdrop-filter:blur(24px);display:flex;align-items:center;justify-content:space-around">{dock}</div>{indicator(True)}"""

def frame(inner, bg='#FFF6EE'):
    return f"""<div style="position:absolute;left:50%;top:198px;transform:translateX(-50%) scale(.8667);transform-origin:top center;width:390px;height:844px;border-radius:58px;padding:11px;background:#1C1A20;box-shadow:0 24px 60px rgba(60,30,30,.35),inset 0 0 0 2px #3a3640">
<div style="position:relative;width:390px;height:844px;border-radius:48px;overflow:hidden;background:{bg}">{inner}</div></div>"""

async def run():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':797},device_scale_factor=3,locale='ja-JP' if JA else 'en-US')
        pg=await ctx.new_page()
        await pg.goto('http://127.0.0.1:8088/'); await pg.wait_for_timeout(2000)
        await pg.fill('input','あなた' if JA else 'Me'); await pg.get_by_role('button',name='はじめる' if JA else 'Get started').click(); await pg.wait_for_timeout(1200)
        auth=await pg.evaluate("localStorage.getItem('nm.auth.v1')")
        r=call(auth,'POST','/v1/groups',{'name':G}); code=r['group']['code']; gid=r['group']['id']
        call(auth,'POST',f'/v1/groups/{gid}/posts',{'kind':'kao','mood':'happy','word':'おはよ' if JA else 'morning'})
        for n,(k,m,w) in zip(NAMES,POSTS):
            u=call(None,'POST','/v1/register',{'name':n,'lang':LANG}); tk=u['uid']+'.'+u['token']
            call(tk,'POST','/v1/join',{'code':code}); call(tk,'POST',f'/v1/groups/{gid}/posts',{'kind':k,'mood':m,'word':w})
        await pg.reload(); await pg.wait_for_timeout(2500)
        await pg.screenshot(path='/tmp/s1.png')
        await pg.get_by_text('キャラ' if JA else 'Character',exact=True).click(); await pg.wait_for_timeout(300)
        await pg.get_by_label('会いたい' if JA else 'Miss you').click(); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/s2.png')
        await pg.get_by_text('落書き' if JA else 'Doodle',exact=True).click(); await pg.wait_for_timeout(500)
        box=await pg.locator('svg').last.bounding_box()
        cx,cy=box['x']+box['width']*0.32,box['y']+box['height']*0.5
        pts=[(cx+16*math.sin(t)**3*3.2, cy-(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))*3.2) for t in [i/40*2*math.pi for i in range(41)]]
        await pg.mouse.move(*pts[0]); await pg.mouse.down()
        for q in pts[1:]: await pg.mouse.move(*q)
        await pg.mouse.up()
        await pg.locator('[aria-label="'+('ペン' if JA else 'Pen')+'"]').nth(1).click()
        cx2=box['x']+box['width']*0.68
        for (x0,y0,x1,y1) in [(-30,-14,-30,-6),(20,-14,20,-6)]:
            await pg.mouse.move(cx2+x0,cy+y0); await pg.mouse.down(); await pg.mouse.move(cx2+x1,cy+y1,steps=4); await pg.mouse.up()
        await pg.mouse.move(cx2-38,cy+14); await pg.mouse.down()
        for i in range(21):
            t=i/20; await pg.mouse.move(cx2-38+76*t, cy+14+28*math.sin(math.pi*t))
        await pg.mouse.up(); await pg.wait_for_timeout(400)
        await pg.screenshot(path='/tmp/s4.png')
        await pg.get_by_label('その日の流れ' if JA else 'The day’s flow').click(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/s5.png')
        pg2=await b.new_page(viewport={'width':440,'height':956},device_scale_factor=3)
        for i,(t1,t2) in enumerate(CAPS):
            c1,c2=COLS[i]
            if i in (0,1,3,4):
                img=base64.b64encode(open(f'/tmp/s{i+1}.png','rb').read()).decode()
                inner=f'{status(False)}<img src="data:image/png;base64,{img}" style="position:absolute;left:0;top:47px;width:390px;height:797px">{indicator(False)}'
                screen=frame(inner)
            elif i==2: screen=frame(lockscreen(),'#000')
            else: screen=frame(homescreen(),'#000')
            html=f"""<html><body style="margin:0;width:440px;height:956px;overflow:hidden;position:relative;background:linear-gradient(180deg,{c1},{c2});font-family:'Noto Sans CJK JP',sans-serif;">
<div style="text-align:center;padding-top:48px;color:#fff;font-weight:900;text-shadow:0 2px 10px rgba(80,40,30,.18)"><div style="font-size:27px;line-height:1.35">{t1}</div><div style="font-size:{'31' if len(t2)>16 else '35'}px;line-height:1.3;padding:0 14px">{t2}</div></div>{screen}</body></html>"""
            await pg2.set_content(html); await pg2.wait_for_timeout(400)
            await pg2.screenshot(path=f'/home/claude/tabi-shiori/nowmoji/store/{LANG}_{i+1}.png')
        await b.close()
asyncio.run(run())
