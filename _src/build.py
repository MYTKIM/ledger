"""우진 통합 장부 오프라인 앱 빌드.

원본(_src/ledger.html)을 그대로 가져와, 기기 내 저장소(store.js)와
이 기기 화면(ui.js), 오프라인 실행(sw.js)을 붙여 저장소 맨 위에 게시용 파일을 만듭니다.

사용: python3 _src/build.py   (클라이언트 ID는 아래 CLIENT_ID에 들어 있음)
"""
import json, re, shutil, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "ledger.html"
OUT = ROOT.parent  # 저장소 맨 위 = GitHub Pages로 게시되는 곳
CLIENT_ID = "976898373340-73drvqk2n2obbb3jvdm4phc3id9nfup4.apps.googleusercontent.com"
client_id = sys.argv[1] if len(sys.argv) > 1 else CLIENT_ID
version = datetime.datetime.now().strftime("%Y.%m.%d-%H%M")

src = SRC.read_text(encoding="utf-8")
cut = src.index('<div class="wrap">')
head_part, body_part = src[:cut], src[cut:]

# 외부 CDN 대신 함께 배포하는 파일을 씁니다 (오프라인에서도 xlsx 읽기 가능).
head_part, n = re.subn(r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/xlsx/[^"]+"></script>',
                       '<script src="vendor/xlsx.full.min.js"></script>', head_part)
assert n == 1, "xlsx script tag not found"
head_part = head_part.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")

# 앱 본체 스크립트 앞에 저장소를, 뒤에 이 기기 화면을 넣습니다.
marker = "<script>\n(function(){"
assert body_part.count(marker) == 1, "main script marker not found"
body_part = body_part.replace(marker, '<script src="config.js"></script>\n<script src="store.js"></script>\n' + marker)
body_part = body_part.rstrip() + '\n<script src="ui.js"></script>\n'

PWA_HEAD = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F3F5F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121714" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="장부">
<meta name="robots" content="noindex, nofollow">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/favicon-32.png">
<script>try{{if(localStorage.getItem("ldg_pin_hash")&&!sessionStorage.getItem("ldg_unlocked"))document.documentElement.dataset.locked="1"}}catch(e){{}}</script>
<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
body{{margin:0;font-size:14px;-webkit-text-size-adjust:100%}}
img{{max-width:100%}} [hidden]{{display:none!important}}
[data-pwa] #driveList{{display:none}}
html[data-locked] .wrap, html[data-locked] .fab{{visibility:hidden}}
.sync-pill{{display:inline-flex;align-items:center;gap:7px;font-size:12.5px}}
.sync-pill .dot{{width:8px;height:8px;border-radius:50%;flex:none}}
.dot-ok{{background:var(--in)}} .dot-warn{{background:var(--warn)}} .dot-plain{{background:var(--muted)}} .dot-busy{{background:var(--corp)}}
@media (prefers-reduced-motion:no-preference){{.dot-busy{{animation:ldgpulse 1s ease-in-out infinite}}}}
@keyframes ldgpulse{{50%{{opacity:.3}}}}
#lockScreen{{position:fixed;inset:0;z-index:100;background:var(--paper);display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px))}}
#lockForm{{display:grid;gap:12px;width:min(320px,100%);text-align:center}}
#lockForm h2{{margin:4px 0 6px;font-size:18px}}
#lockPin{{font-family:var(--f-num);font-size:24px;text-align:center;letter-spacing:.3em;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)}}
#lockMsg{{min-height:1.4em;margin:0;color:var(--warn);font-size:13px}}
.lock-mark{{display:grid;gap:6px;width:72px;margin:0 auto}}
.lock-mark i{{display:block;height:10px;border-radius:5px;background:var(--corp)}}
.lock-mark i:nth-child(2){{width:62%;background:var(--me)}} .lock-mark i:nth-child(3){{width:82%;background:var(--in)}}
#updBar{{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 84px);z-index:40;background:var(--ink);color:var(--paper);padding:8px 8px 8px 14px;border-radius:999px;display:flex;gap:10px;align-items:center;font-size:13px;max-width:calc(100% - 32px)}}
</style>
"""

OUT.mkdir(exist_ok=True)
html = PWA_HEAD + head_part + "</head>\n<body>\n" + body_part + "</body>\n</html>\n"
(OUT / "index.html").write_text(html, encoding="utf-8")
(OUT / "config.js").write_text(
    "/* 구글 OAuth 클라이언트 ID는 비밀값이 아닙니다. 이 앱 주소에서만 쓰이도록 구글 클라우드에서 제한됩니다. */\n"
    f"window.LEDGER_CONFIG = {{ googleClientId: {json.dumps(client_id)} }};\n"
    f"window.LEDGER_VERSION = {json.dumps(version)};\n", encoding="utf-8")
for f in ["store.js", "ui.js"]:
    shutil.copy(ROOT / f, OUT / f)
(OUT / "sw.js").write_text((ROOT / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version), encoding="utf-8")
shutil.copytree(ROOT / "vendor", OUT / "vendor", dirs_exist_ok=True)
shutil.copytree(ROOT / "icons", OUT / "icons", dirs_exist_ok=True)
(OUT / "manifest.webmanifest").write_text(json.dumps({
    "name": "우진 통합 장부", "short_name": "장부", "lang": "ko",
    "description": "지속발전연구소 법인과 개인의 수입·지출, 예산, 통장 잔액을 한 곳에서",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#F3F5F2", "theme_color": "#F3F5F2",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT / ".nojekyll").write_text("")
print("built", version, "client_id" if client_id else "(no client id)")
