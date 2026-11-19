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
- `tools/verify_ai_export.py` AI 분석용 내보내기 파일 독립 검산(앱 코드 없이 파일만으로 월 합계·프로젝트 합계·외화 환산 재계산). `tools/AI_EXPORT_CHECK.md` ChatGPT 검증 절차.
- `holidays.json` 공휴일(한국천문연구원 특일 정보). `.github/workflows/holidays.yml`이 매달 `tools/fetch_holidays.py`로 갱신(인증키는 저장소 Secrets `KASI_KEY`). 앱은 이것 + 내장 표(KR_HOL) + 설정의 추가 휴일로 카드 결제일을 다음 영업일로 보정. 자동 작업이 커밋하므로 push 전에 pull.
- `v1/` 메뉴 개편(2026-11-12) 전 화면, `v2/` 내비게이션 개편(2026-11-20) 전 화면을 보관한 정적 사본. 빌드가 건드리지 않음. 되돌릴 때 참고(설정 › 점검·도구에서 열림).

## 화면 규칙 (2026-11-20 개편)
- 탭: 홈(맨 위 '할 일' + 탭 배지) · 거래 · 분석 · 예산([월·연 예산 | 프로젝트·행사]) · 자산(맞추기·정산 / 계좌 / 자동이체 / 예수금) · 설정(장부 구조 / 사람 / 반복·계획 / 데이터 / 점검·도구 / 기기).
- 거래 입력 버튼은 설정 빼고 모든 탭. 달 고르기는 자산·설정에서 숨김.
- 사람 목록은 하나(pplOv): 프로젝트 참가 후보(config/main.pjPeople) + 예수금 대상(config/accounts.people).
- 팝업: 모든 팝업에 오른쪽 위 ×와 아래 단추줄(.actions). 바깥 누르기는 누르기 시작·끝이 모두 바깥일 때만 닫힘. 고치는 창(GUARD_OV)은 저장 안 한 변경이 있으면 닫기 전에 '저장하고 닫기/저장 안 하고 닫기/계속 고치기'를 묻는다. Esc는 맨 위 창만.
- 설정 화면 단추는 `data-go`로 숨은 원래 단추(#legacyTriggers 등)를 누른다. header.top .tools는 ui.js의 동기화 표시 자리라 지우면 안 됨.

## 고치고 게시하는 법
1. `_src/` 파일 수정
2. `python3 _src/build.py`
3. 커밋 후 `main`에 push → 1~2분 뒤 반영. 열려 있는 앱은 "새 버전" 알림 후 다시 열기.

## 데이터 원칙
- 장부 데이터는 절대 저장소에 넣지 않는다 (기기 IndexedDB와 사용자 구글 드라이브 앱 전용 폴더에만 있음).
- AI 분석용 내보내기: 사용자가 누를 때만 일반 드라이브 'U JIN Ledger AI' 폴더에 ledger_ai_latest.json·ledger_ai_transactions.csv를 덮어씀(drive.file 권한). 폴더·파일 ID는 config/main의 aiExport에 저장. 원본 동기화(appDataFolder)와 분리.
- 문서 경로: months/YYYY-MM {ym, tx[], del{}}, plans/YYYY-MM {out{}, inc{}}, config/main(결제수단·계정), config/accounts(계좌·잔액), config/budgets(예산·집행일·자동기록), config/pjplans(프로젝트 예정비용 items[]; 거래 연결은 거래의 pe 필드만 원본).
