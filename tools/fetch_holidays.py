"""한국천문연구원 특일 정보(공휴일)를 받아 저장소 맨 위 holidays.json을 만든다.
GitHub Actions(.github/workflows/holidays.yml)가 매달 실행. 인증키는 저장소 Secrets의 KASI_KEY.
받기에 실패한 해는 예전 파일의 값을 그대로 둔다(빈 값으로 덮어쓰지 않음)."""
import json, os, sys, urllib.request, urllib.parse, datetime, xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "holidays.json"
KEY = os.environ.get("KASI_KEY", "").strip()
URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"

def fetch_year(y):
    q = urllib.parse.urlencode({"solYear": y, "numOfRows": 100, "pageNo": 1})
    raw = urllib.request.urlopen(f"{URL}?serviceKey={KEY}&{q}", timeout=30).read().decode("utf-8")
    root = ET.fromstring(raw)
    code = (root.findtext(".//resultCode") or "").strip()
    if code not in ("00", "0000"):
        raise RuntimeError(f"{y}: API 오류 {code} {root.findtext('.//resultMsg')} {raw[:200]}")
    out = []
    for it in root.iter("item"):
        if (it.findtext("isHoliday") or "Y").strip() != "Y":
            continue
        d = (it.findtext("locdate") or "").strip()
        if len(d) == 8:
            out.append({"d": f"{d[:4]}-{d[4:6]}-{d[6:]}", "name": (it.findtext("dateName") or "").strip()})
    return sorted({x["d"]: x for x in out}.values(), key=lambda x: x["d"])

def main():
    if not KEY:
        sys.exit("KASI_KEY가 없습니다 (저장소 Settings › Secrets › Actions).")
    old = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {"years": {}}
    years = dict(old.get("years", {}))
    now = datetime.date.today().year
    ok = []
    for y in (now - 1, now, now + 1, now + 2):
        try:
            L = fetch_year(y)
            if L:
                years[str(y)] = L; ok.append(f"{y}:{len(L)}")
            else:
                print(f"{y}: 아직 자료 없음 (예전 값 유지)")
        except Exception as e:
            print("받기 실패:", e)
    if not ok:
        sys.exit("한 해도 받지 못했습니다.")
    new = {"source": "한국천문연구원 특일 정보 (공공데이터포털)", "years": dict(sorted(years.items()))}
    if {k: v for k, v in old.items() if k != "updated"} != new:
        new["updated"] = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
        OUT.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n", "utf-8")
        print("갱신:", ", ".join(ok))
    else:
        print("바뀐 것 없음:", ", ".join(ok))

main()
