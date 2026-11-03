# 우진 통합 장부 (오프라인 웹 앱)

김우진 님의 법인·개인 수입/지출 장부. GitHub Pages(https://mytkim.github.io/ledger/)로 게시되는 PWA.

## 구조
- `_src/` 원본. 고칠 때는 여기만 고친다.
  - `ledger.html` 앱 본체(화면·계산). claude.ai 아티팩트 판과 같은 코드이며 저장소 API(`claude.use("db")`)만 씀.
  - `store.js` 기기 내 저장(IndexedDB) + 구글 드라이브 appDataFolder 동기화. `window.claude.use("db")`를 흉내 냄.
    months/* 문서는 거래(id) 단위 병합(u = 수정 시각, del = 삭제 표시), 나머지는 나중 저장 우선.
  - `ui.js` 동기화 표시, 이 기기 메뉴, 비밀번호 잠금, 서비스 워커 등록.
  - `sw.js` 오프라인 캐시. `build.py`가 버전 문자열을 넣는다.
  - `build.py` 원본을 합쳐 저장소 맨 위(index.html, config.js, store.js, ui.js, sw.js, manifest, icons, vendor)에 게시 파일을 만든다.
- 저장소 맨 위 파일은 빌드 결과물. 직접 고치지 말 것.

## 고치고 게시하는 법
1. `_src/` 파일 수정
2. `python3 _src/build.py`
3. 커밋 후 `main`에 push → 1~2분 뒤 반영. 열려 있는 앱은 "새 버전" 알림 후 다시 열기.

## 데이터 원칙
- 장부 데이터는 절대 저장소에 넣지 않는다 (기기 IndexedDB와 사용자 구글 드라이브 앱 전용 폴더에만 있음).
- 문서 경로: months/YYYY-MM {ym, tx[], del{}}, plans/YYYY-MM {out{}, inc{}}, config/main(결제수단·계정), config/accounts(계좌·잔액), config/budgets(예산·집행일·자동기록).
