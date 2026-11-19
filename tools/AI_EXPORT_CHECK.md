# AI 분석용 내보내기 — ChatGPT 검증 절차

1. 앱 › 설정 › 데이터 › **AI 분석용 내보내기**에서 기간을 행사 기간이 들어가게 고르고(예: 올해) **AI 분석본 만들기/업데이트**.
2. (선택) 같은 창의 **이 기기로 내려받기**로 받은 파일을 독립 검산:
   `python3 tools/verify_ai_export.py ledger_ai_latest.json Winner`
   → "모두 맞습니다 ✓"와 프로젝트 재구성 표가 나와야 함. 이 표가 아래 질문의 정답표.
3. ChatGPT에 구글 드라이브를 연결한 뒤, 다음 질문을 그대로 붙여 넣기:

> 내 구글 드라이브 'U JIN Ledger AI' 폴더의 ledger_ai_latest.json을 읽어 줘. 먼저 readme 항목의 규칙을 따르고, transactions만으로 계산해.
> 1) Winner Summit 2026 Shanghai 프로젝트의 승인예산, 총지출, 남은 예산, 집행률
> 2) 비용 대상(beneficiary)별 · 목적(purpose)별 · 세무 구분(taxTreatment)별 합계
> 3) 외화 거래 목록(원래 통화·금액·적용 환율·원화 금액)
> 4) 네 계산이 파일 안 projectSummary와 일치하는지

4. 판정: ChatGPT 답의 1)~3) 숫자가 2단계 검산표와 원 단위까지 같고, 4)에서 일치한다고 답하면 통과.
   다르면 어느 거래를 빼거나 더했는지 물어보고(이체·잔액 맞춤을 넣었는지 등), 결과를 알려 주면 readme 규칙을 보강.
