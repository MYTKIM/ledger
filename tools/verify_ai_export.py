#!/usr/bin/env python3
"""AI 분석용 내보내기 파일(ledger_ai_latest.json) 독립 검산.
앱 코드 없이 파일만 읽어서 다시 계산하고, 파일 안의 요약(monthlyTotals, projectSummary)과 맞는지 확인합니다.
사용: python3 verify_ai_export.py ledger_ai_latest.json [프로젝트 이름 일부]
"""
import json, sys, collections

def shares(t):
    """거래를 사람 몫으로: allocation이 있으면 몫마다(목적·세무는 몫 값, 없으면 거래 값), 없으면 거래 하나."""
    if t.get("allocation"):
        ap, at = t.get("allocationPurpose") or {}, t.get("allocationTax") or {}
        return [(p, a, ap.get(p) or t["purpose"], at.get(p) or t["taxTreatment"] or "REVIEW") for p, a in t["allocation"].items()]
    return [(t["beneficiary"], t["amount"], t["purpose"], t["taxTreatment"] or "REVIEW")]

def main(path, proj_q=None):
    d = json.load(open(path, encoding="utf-8"))
    T = d["transactions"]; ok = True
    def bad(msg):
        nonlocal ok; ok = False; print("  ✗", msg)
    print(f"파일: {path}  · 스키마 {d.get('schemaVersion')} · 기간 {d['period']['from']} ~ {d['period']['to']} · 거래 {len(T)}건")

    print("1) 거래 ID 중복 없음")
    c = collections.Counter(t["id"] for t in T); dup = [k for k, v in c.items() if v > 1]
    if dup: bad(f"중복 ID {len(dup)}개: {dup[:5]}")

    print("2) 금지 정보 없음 (토큰·PIN·해시 등)")
    raw = json.dumps(d, ensure_ascii=False).lower()
    for k in ["ldg_token", "access_token", "pin_hash", "pin_salt", "ldg_pin", "oauth"]:
        if k in raw: bad(f"'{k}' 문자열이 들어 있음")

    print("3) 이체·정산 이체는 손익 0, 손익 부호 규칙")
    for t in T:
        e = t["economicEffect"]["amount"]
        if t["type"] == "transfer" and e != 0: bad(f"이체인데 손익 {e}: {t['id']}")
        if t["includeInTotals"] and t["type"] == "expense" and e != -t["amount"]: bad(f"지출 손익 부호 오류: {t['id']}")
        if t["includeInTotals"] and t["type"] == "income" and e != t["amount"]: bad(f"수입 손익 부호 오류: {t['id']}")

    print("4) 월별 합계: 거래에서 다시 계산 = 파일의 monthlyTotals")
    agg = collections.defaultdict(lambda: collections.Counter())
    for t in T:
        if not t["includeInTotals"]: continue
        m = t["source"]["month"]
        if t["type"] == "expense":
            agg[m]["expenseTotal"] += t["amount"]
            agg[m]["expenseCorp" if t["entity"] == "SUSLAB" else "expensePersonal"] += t["amount"]
        elif t["type"] == "income": agg[m]["income"] += t["amount"]
    for mt in d.get("monthlyTotals", []):
        a = agg[mt["month"]]
        for k in ["expenseTotal", "expenseCorp", "expensePersonal", "income"]:
            if a[k] != mt[k]: bad(f"{mt['month']} {k}: 거래 합 {a[k]:,} ≠ 요약 {mt[k]:,}")

    print("5) 외화: 원화 = 외화 × 적용 환율 × (1+수수료) (원화를 직접 고친 건은 실제 환율로)")
    for t in T:
        if t["originalAmount"] is None: continue
        rate = t["effectiveRate"] or t["exchangeRate"] * (1 + (t["cardFeePct"] or 0) / 100)
        if abs(t["originalAmount"] * rate - t["amount"]) > max(2, t["amount"] * 0.001): bad(f"외화 환산 불일치: {t['id']} {t['originalAmount']} {t['originalCurrency']} → {t['amount']}")

    print("6) 사람별 배분: 합계 = 거래 금액, 배분 거래는 beneficiary=SPLIT")
    for t in T:
        if t.get("allocation"):
            if sum(t["allocation"].values()) != t["amount"]: bad(f"배분 합계 {sum(t['allocation'].values()):,} ≠ 금액 {t['amount']:,}: {t['id']}")
            if t["beneficiary"] != "SPLIT": bad(f"배분 거래인데 beneficiary={t['beneficiary']}: {t['id']}")

    print("7) 프로젝트: 참가자 수 = people + 기타, 거래에서 다시 계산 = projectSummary")
    for pj in d.get("projects", []):
        if pj.get("totalAttendees") != len(pj.get("people", [])) + (pj.get("otherPeopleCount") or 0): bad(f"{pj['name']} 총 참석인원 불일치")
    for ps in d.get("projectSummary", []):
        xs = [t for t in T if t["projectId"] == ps["projectId"] and t["type"] == "expense" and t["includeInTotals"]]
        inT = {t["id"] for t in xs}
        if set(ps["transactionIds"]) - inT:
            print(f"  · {ps['name']}: 내보낸 기간 밖의 거래 {len(set(ps['transactionIds'])-inT)}건이 요약에 포함됨 (기간을 넓혀 내보내면 함께 검산됩니다)")
            continue
        s = sum(t["amount"] for t in xs)
        if s != ps["spent"]: bad(f"{ps['name']} 지출 {s:,} ≠ 요약 {ps['spent']:,}")
        g = collections.Counter()
        for t in xs: g[t["beneficiary"] or "UNSPECIFIED"] += t["amount"]
        if dict(g) != {k: v for k, v in ps["byBeneficiary"].items() if v}: bad(f"{ps['name']} byBeneficiary 불일치: {dict(g)} vs {ps['byBeneficiary']}")
        for i, key, dflt in [(0, "byPerson", "UNSPECIFIED"), (2, "byPurpose", "UNSPECIFIED"), (3, "byTaxTreatment", "REVIEW")]:
            if key not in ps: continue
            g = collections.Counter()
            for t in xs:
                for sh in shares(t): g[sh[i] or dflt] += sh[1]
            if dict(g) != {k: v for k, v in ps[key].items() if v}: bad(f"{ps['name']} {key} 불일치: {dict(g)} vs {ps[key]}")
            if sum(g.values()) != s: bad(f"{ps['name']} {key} 합계가 지출과 다름 (이중 집계?)")

    if proj_q:
        print(f"\n[재구성] '{proj_q}' 프로젝트 비용")
        P = [p for p in d.get("projectSummary", []) if proj_q.lower() in p["name"].lower()]
        for ps in P:
            xs = [t for t in T if t["projectId"] == ps["projectId"] and t["type"] == "expense"]
            s = sum(t["amount"] for t in xs)
            pj = next((p for p in d.get("projects", []) if p["projectId"] == ps["projectId"]), {})
            print(f"  {ps['name']} · 참가자 {', '.join(pj.get('people', [])) or '미지정'} + 기타 {pj.get('otherPeopleCount', 0)}명 = 총 {pj.get('totalAttendees', '?')}명")
            print(f"  승인예산 {ps['approvedBudget'] or 0:,} · 지출 {s:,} · 남은 예산 {(ps['approvedBudget'] or 0)-s:,}")
            for i, nm in [(0, "사람별 귀속(배분 반영)"), (2, "목적"), (3, "세무 구분")]:
                g = collections.Counter()
                for t in xs:
                    for sh in shares(t): g[sh[i] or "미지정"] += sh[1]
                print(f"   - {nm}: " + ", ".join(f"{k} {v:,}" for k, v in g.most_common()))
            g = collections.Counter()
            for t in xs: g[t["entity"] or "미지정"] += t["amount"]
            print("   - 부담 주체: " + ", ".join(f"{k} {v:,}" for k, v in g.most_common()))
            for t in sorted(xs, key=lambda t: t["date"]):
                fx = f" ({t['originalAmount']:,} {t['originalCurrency']} @ {t['exchangeRate']})" if t["originalAmount"] else ""
                al = (" = " + " + ".join(f"{p} {a:,}" for p, a in t["allocation"].items())) if t.get("allocation") else ""
                print(f"     {t['date']} {t['description']} {t['amount']:,}원{fx} · {t['beneficiary'] or '-'}{al} · {t['purpose'] or '-'} · {t['taxTreatment']}")
    print("\n결과:", "모두 맞습니다 ✓" if ok else "맞지 않는 항목이 있습니다 ✗")
    return 0 if ok else 1

if __name__ == "__main__":
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
