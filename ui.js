/* 우진 통합 장부 — 이 기기 전용 화면: 동기화 표시, 비밀번호 잠금, 새 버전 알림 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) {} },
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- 화면 조각 ---------- */
  const tools = document.querySelector("header.top .tools");
  const pill = document.createElement("button");
  pill.className = "btn sync-pill"; pill.id = "syncPill"; pill.type = "button";
  tools.prepend(pill);
  const devBtn = document.createElement("button");
  devBtn.className = "btn"; devBtn.id = "openDevice"; devBtn.type = "button"; devBtn.textContent = "이 기기";
  tools.appendChild(devBtn);

  document.body.insertAdjacentHTML("beforeend", `
<div class="overlay" id="devOv" hidden>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="devTitle">
    <h3><span id="devTitle">이 기기</span><button class="x" data-close aria-label="닫기">×</button></h3>
    <div class="form">
      <div class="f"><span class="lbl">구글 드라이브 동기화</span><div id="devSync" class="hint"></div>
        <div class="actions"><span></span><div class="r"><button class="btn small" id="devLogout" type="button">이 기기에서 로그아웃</button><button class="btn primary small" id="devLogin" type="button">구글 로그인</button></div></div></div>
      <div class="f"><span class="lbl">앱 잠금 비밀번호</span>
        <p class="hint" style="margin:0 0 8px">앱을 열 때와 5분 넘게 다른 앱을 쓰다 돌아올 때 비밀번호를 묻습니다. 기기마다 따로 정합니다. 잊어버리면 브라우저의 사이트 데이터를 지우고 다시 동기화하면 됩니다.</p>
        <div class="two"><input id="pin1" type="password" inputmode="numeric" autocomplete="new-password" placeholder="새 비밀번호 (숫자 4자리 이상)" aria-label="새 비밀번호"><input id="pin2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="한 번 더" aria-label="비밀번호 확인"></div>
        <div class="actions"><span id="pinMsg" class="hint" style="background:none;padding:0"></span><div class="r"><button class="btn small" id="pinOff" type="button">잠금 끄기</button><button class="btn primary small" id="pinSet" type="button">비밀번호 저장</button></div></div></div>
      <div class="f"><span class="lbl">앱 버전</span><div class="hint" id="devVer"></div></div>
    </div>
  </div>
</div>
<div id="lockScreen" hidden>
  <form id="lockForm" autocomplete="off">
    <div class="lock-mark" aria-hidden="true"><i></i><i></i><i></i></div>
    <h2>우진 통합 장부</h2>
    <input id="lockPin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
    <button class="btn primary" type="submit">열기</button>
    <p id="lockMsg" role="alert"></p>
  </form>
</div>
<div id="updBar" hidden>새 버전이 준비됐습니다. <button class="btn small" id="updGo" type="button">다시 열기</button></div>`);

  /* ---------- 동기화 표시 ---------- */
  const fmtT = (t) => { if (!t) return "아직 없음"; const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); const today = new Date().toDateString() === d.toDateString(); return (today ? "" : `${d.getMonth() + 1}/${d.getDate()} `) + `${p(d.getHours())}:${p(d.getMinutes())}`; };
  function paint(s) {
    const pend = s.pending ? ` · 올릴 기록 ${s.pending}` : "";
    const map = {
      local: ["dot-plain", "이 기기에 저장"],
      noconfig: ["dot-plain", "이 기기에만 저장"],
      signedout: ["dot-warn", "구글 로그인하면 동기화"],
      expired: ["dot-warn", "다시 로그인 필요" + pend],
      offline: ["dot-plain", "오프라인" + pend],
      syncing: ["dot-busy", "동기화 중…"],
      synced: ["dot-ok", "동기화됨 " + fmtT(s.last) + pend],
      error: ["dot-warn", "동기화 실패" + pend],
    };
    const [cls, txt] = map[s.state] || map.local;
    pill.innerHTML = `<span class="dot ${cls}"></span>${esc(txt)}`;
    pill.title = s.state === "error" ? "다시 시도: " + s.error : "";
    const ds = $("devSync");
    if (ds) {
      ds.innerHTML = !window.LedgerSync.hasConfig()
        ? "구글 로그인 키가 아직 설정되지 않아 이 기기에만 저장합니다."
        : `상태: <b>${esc(txt)}</b><br>마지막 동기화: ${esc(fmtT(s.last))}<br>기록은 먼저 이 기기에 저장되고, 인터넷이 연결되면 구글 드라이브의 앱 전용 숨김 폴더와 맞춰집니다.`;
      $("devLogin").hidden = !window.LedgerSync.hasConfig();
      $("devLogout").hidden = !(ls.get("ldg_signed_in"));
      $("devLogin").textContent = s.state === "synced" || s.state === "syncing" ? "지금 동기화" : "구글 로그인";
    }
  }
  window.LedgerSync.onStatus(paint);
  pill.onclick = () => { const s = window.LedgerSync.status(); if (s.state === "noconfig" || s.state === "local") { openDev(); return; } window.LedgerSync.syncNow(); };
  function openDev() { $("devOv").hidden = false; paint(window.LedgerSync.status()); $("devVer").textContent = (window.LEDGER_VERSION || "") + (navigator.serviceWorker && navigator.serviceWorker.controller ? " · 오프라인 사용 가능" : " · 오프라인 준비 중"); }
  devBtn.onclick = openDev;
  $("devOv").addEventListener("click", (e) => { if (e.target.id === "devOv" || e.target.closest("[data-close]")) $("devOv").hidden = true; });
  $("devLogin").onclick = () => window.LedgerSync.syncNow();
  $("devLogout").onclick = () => { window.LedgerSync.logout(); paint(window.LedgerSync.status()); };

  /* ---------- 비밀번호 잠금 ---------- */
  async function hashPin(pin, salt) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const hasPin = () => !!ls.get("ldg_pin_hash");
  function lock() { if (!hasPin()) return; ss.del("ldg_unlocked"); document.documentElement.dataset.locked = "1"; $("lockScreen").hidden = false; $("lockMsg").textContent = ""; $("lockPin").value = ""; setTimeout(() => $("lockPin").focus(), 50); }
  function unlock() { ss.set("ldg_unlocked", "1"); delete document.documentElement.dataset.locked; $("lockScreen").hidden = true; }
  $("lockForm").onsubmit = async (e) => {
    e.preventDefault();
    const tries = +ss.get("ldg_tries") || 0;
    if (tries >= 5 && Date.now() < (+ss.get("ldg_wait") || 0)) { $("lockMsg").textContent = "잠시 뒤에 다시 시도하세요."; return; }
    const h = await hashPin($("lockPin").value, ls.get("ldg_pin_salt") || "");
    if (h === ls.get("ldg_pin_hash")) { ss.del("ldg_tries"); unlock(); }
    else { ss.set("ldg_tries", String(tries + 1)); if (tries + 1 >= 5) ss.set("ldg_wait", String(Date.now() + 30000)); $("lockMsg").textContent = "비밀번호가 맞지 않습니다."; $("lockPin").value = ""; }
  };
  $("pinSet").onclick = async () => {
    const a = $("pin1").value, b = $("pin2").value;
    if (!/^\d{4,}$/.test(a)) { $("pinMsg").textContent = "숫자 4자리 이상으로 정해 주세요."; return; }
    if (a !== b) { $("pinMsg").textContent = "두 번 입력한 비밀번호가 다릅니다."; return; }
    const salt = crypto.getRandomValues(new Uint32Array(2)).join("-");
    ls.set("ldg_pin_salt", salt); ls.set("ldg_pin_hash", await hashPin(a, salt)); ss.set("ldg_unlocked", "1");
    $("pin1").value = $("pin2").value = ""; $("pinMsg").textContent = "저장했습니다.";
  };
  $("pinOff").onclick = () => { ls.del("ldg_pin_hash"); ls.del("ldg_pin_salt"); $("pinMsg").textContent = "잠금을 껐습니다."; };
  if (hasPin() && !ss.get("ldg_unlocked")) lock(); else delete document.documentElement.dataset.locked;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hasPin() && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) lock();
  });

  /* ---------- 오프라인 실행(서비스 워커)과 새 버전 ---------- */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      const show = () => { $("updBar").hidden = false; };
      if (reg.waiting && navigator.serviceWorker.controller) show();
      reg.addEventListener("updatefound", () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) show(); });
      });
      $("updGo").onclick = () => { if (reg.waiting) reg.waiting.postMessage("skip"); else location.reload(); };
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloaded) return; reloaded = true; location.reload(); });
  }
})();
