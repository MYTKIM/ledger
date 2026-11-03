/* 우진 통합 장부 — 기기 내 저장소 + 구글 드라이브 동기화
 *
 * 앱 코드는 claude.ai 저장소와 같은 모양(collection/doc/set/onSnapshot)으로
 * 이 파일을 씁니다. 모든 기록은 먼저 이 기기(IndexedDB)에 저장되고,
 * 온라인이면 구글 드라이브의 앱 전용 숨김 폴더(appDataFolder)와 맞춥니다.
 *
 * 병합 규칙
 *  - months/* 문서: 거래 하나하나를 id로 맞춥니다. 같은 거래를 두 기기에서 고치면
 *    나중에 고친 쪽(u)이 남고, 지운 거래는 삭제 표시(del)로 전파됩니다.
 *  - 그 밖의 문서(설정·예산·잔액·계획): 나중에 저장한 쪽이 남습니다.
 */
(function () {
  "use strict";
  const CFG = window.LEDGER_CONFIG || {};
  const DBN = "woojin-ledger", ST = "docs";
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const API = "https://www.googleapis.com/drive/v3", UP = "https://www.googleapis.com/upload/drive/v3";
  const DEL_KEEP_MS = 400 * 864e5;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  function canon(o) {
    if (Array.isArray(o)) return "[" + o.map(canon).join(",") + "]";
    if (o && typeof o === "object") return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
    return JSON.stringify(o);
  }
  const parentOf = (p) => p.slice(0, p.lastIndexOf("/"));
  const isMonths = (p) => p.startsWith("months/");

  /* ---------- IndexedDB ---------- */
  let idb = null;
  function openIdb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "path" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  const store = (mode) => idb.transaction(ST, mode).objectStore(ST);
  const idbAll = () => new Promise((res, rej) => { const r = store("readonly").getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
  const idbPut = (rec) => new Promise((res, rej) => { const r = store("readwrite").put(rec); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });

  /* ---------- 메모리 사본과 구독 ---------- */
  const mem = new Map(); // path -> {path, data, t, dirty, syncedT}
  const subs = new Set();
  function docSnap(path) {
    const r = mem.get(path);
    return { id: path.split("/").pop(), exists: !!r, data: () => (r ? clone(r.data) : undefined), metadata: { fromCache: true, hasPendingWrites: !!(r && r.dirty) } };
  }
  function colSnap(cp) {
    const docs = [...mem.keys()].filter((p) => parentOf(p) === cp).sort().map(docSnap);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: true, hasPendingWrites: false } };
  }
  function notify(path) {
    subs.forEach((s) => {
      try {
        if (s.kind === "doc" && s.path === path) s.cb(docSnap(path));
        if (s.kind === "col" && parentOf(path) === s.path) s.cb(colSnap(s.path));
      } catch (e) { console.error(e); }
    });
  }

  /* ---------- 거래 단위 표시와 병합 ---------- */
  function stampMonths(prev, next, now) {
    const old = new Map(((prev && prev.tx) || []).map((t) => [t.id, t]));
    const del = { ...((prev && prev.del) || {}) };
    (next.tx || []).forEach((t) => {
      const o = old.get(t.id);
      if (!o) t.u = t.u || now;
      else {
        const a = canon({ ...o, u: 0 }), b = canon({ ...t, u: 0 });
        t.u = a === b ? (o.u || 0) : now;
      }
      old.delete(t.id);
    });
    old.forEach((_, id) => { del[id] = now; });
    const cut = now - DEL_KEEP_MS;
    Object.keys(del).forEach((k) => { if (del[k] < cut) delete del[k]; });
    next.del = del;
  }
  function mergeMonths(a, b) {
    const del = { ...((a && a.del) || {}) };
    Object.entries((b && b.del) || {}).forEach(([k, v]) => { if (!(del[k] >= v)) del[k] = v; });
    const m = new Map();
    [...((a && a.tx) || []), ...((b && b.tx) || [])].forEach((t) => { const c = m.get(t.id); if (!c || (t.u || 0) > (c.u || 0)) m.set(t.id, t); });
    const tx = [...m.values()].filter((t) => !(del[t.id] >= (t.u || 0)));
    return { ...(b || {}), ...(a || {}), tx, del };
  }

  /* ---------- 쓰기 ---------- */
  async function setDoc(path, data) {
    const now = Date.now(), prev = mem.get(path);
    data = clone(data);
    if (isMonths(path)) stampMonths(prev && prev.data, data, now);
    const rec = { path, data, t: now, dirty: true, syncedT: prev ? prev.syncedT : null };
    mem.set(path, rec);
    await idbPut(rec);
    notify(path);
    status.pending = [...mem.values()].filter((r) => r.dirty).length;
    emitStatus();
    scheduleSync(2500);
  }

  function makeDocRef(path) {
    return {
      id: path.split("/").pop(), path,
      set: (d) => setDoc(path, d),
      update: (d) => setDoc(path, { ...((mem.get(path) || {}).data || {}), ...d }),
      get: async () => docSnap(path),
      onSnapshot(cb) { const s = { kind: "doc", path, cb }; subs.add(s); setTimeout(() => cb(docSnap(path)), 0); return () => subs.delete(s); },
      collection: (c) => makeColRef(path + "/" + c),
    };
  }
  function makeColRef(path) {
    return {
      path,
      doc: (id) => makeDocRef(path + "/" + (id || "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))),
      get: async () => colSnap(path),
      onSnapshot(cb) { const s = { kind: "col", path, cb }; subs.add(s); setTimeout(() => cb(colSnap(path)), 0); return () => subs.delete(s); },
    };
  }
  const localDb = { doc: makeDocRef, collection: makeColRef };

  /* ---------- 구글 로그인 (리디렉션 방식) ---------- */
  function token() {
    const t = ls.get("ldg_token"), exp = +ls.get("ldg_token_exp") || 0;
    return t && Date.now() < exp - 60000 ? t : null;
  }
  function redirectUri() { return location.origin + location.pathname; }
  function login(silent) {
    if (!CFG.googleClientId) { status.state = "noconfig"; emitStatus(); return; }
    const st = Math.random().toString(36).slice(2);
    try { sessionStorage.setItem("ldg_oauth_state", st); sessionStorage.setItem("ldg_oauth_silent", silent ? "1" : ""); } catch (_) {}
    const q = new URLSearchParams({ client_id: CFG.googleClientId, redirect_uri: redirectUri(), response_type: "token", scope: SCOPE, include_granted_scopes: "true", state: st });
    if (silent) q.set("prompt", "none");
    const hint = ls.get("ldg_login_hint"); if (hint) q.set("login_hint", hint);
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString();
  }
  function logout() { ls.del("ldg_token"); ls.del("ldg_token_exp"); ls.del("ldg_login_hint"); status.state = "signedout"; emitStatus(); }
  // 돌아온 주소(#access_token=...)를 읽고 주소창에서 지웁니다.
  (function readOAuthReturn() {
    const h = location.hash;
    if (!/access_token=|error=/.test(h)) return;
    const p = new URLSearchParams(h.slice(1));
    let expected = null, silent = false;
    try { expected = sessionStorage.getItem("ldg_oauth_state"); silent = sessionStorage.getItem("ldg_oauth_silent") === "1"; sessionStorage.removeItem("ldg_oauth_state"); } catch (_) {}
    if (p.get("access_token") && p.get("state") === expected) {
      ls.set("ldg_token", p.get("access_token"));
      ls.set("ldg_token_exp", String(Date.now() + (+p.get("expires_in") || 3600) * 1000));
      ls.set("ldg_signed_in", "1");
    } else if (p.get("error")) {
      if (!silent) ls.set("ldg_last_auth_error", p.get("error"));
      try { sessionStorage.setItem("ldg_silent_failed", "1"); } catch (_) {}
    }
    history.replaceState(null, "", location.pathname + location.search);
  })();

  async function gfetch(url, opts = {}) {
    const t = token(); if (!t) { const e = new Error("auth"); e.code = "auth"; throw e; }
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + t } });
    if (r.status === 401) { ls.del("ldg_token"); const e = new Error("auth"); e.code = "auth"; throw e; }
    if (!r.ok) {
      let reason = "", msg = "";
      try { const j = await r.json(); const er = (j && j.error) || {}; msg = er.message || ""; reason = ((er.errors || [])[0] || {}).reason || er.status || ""; } catch (_) {}
      const e = new Error(msg || "http " + r.status); e.code = "http" + r.status; e.reason = reason; e.detail = msg;
      if (r.status === 403 && /insufficient|scope/i.test(reason + " " + msg)) { ls.del("ldg_token"); e.code = "scope"; }
      throw e;
    }
    return r;
  }
  const fname = (path) => "doc__" + path.replace(/\//g, "~") + ".json";
  const pathOf = (name) => (name.startsWith("doc__") && name.endsWith(".json") ? name.slice(5, -5).replace(/~/g, "/") : null);
  async function listRemote() {
    const out = new Map(); let pt = "";
    do {
      const r = await gfetch(`${API}/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,appProperties)${pt ? "&pageToken=" + encodeURIComponent(pt) : ""}`);
      const j = await r.json();
      (j.files || []).forEach((f) => { const p = pathOf(f.name); if (p) out.set(p, { id: f.id, t: +((f.appProperties || {}).t) || 0 }); });
      pt = j.nextPageToken || "";
    } while (pt);
    return out;
  }
  async function download(id) { return (await gfetch(`${API}/files/${id}?alt=media`)).json(); }
  async function upload(path, rec, id) {
    const b = "ldg" + Math.random().toString(36).slice(2);
    const meta = { name: fname(path), appProperties: { t: String(rec.t) } };
    if (!id) meta.parents = ["appDataFolder"];
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ path, t: rec.t, data: rec.data })}\r\n--${b}--`;
    const r = await gfetch(`${UP}/files${id ? "/" + id : ""}?uploadType=multipart&fields=id`, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
    return (await r.json()).id;
  }

  /* ---------- 동기화 ---------- */
  const status = { state: "local", pending: 0, last: +ls.get("ldg_last_sync") || 0, error: "" };
  const statusSubs = new Set();
  function emitStatus() { statusSubs.forEach((f) => { try { f({ ...status }); } catch (_) {} }); }
  let syncing = false, again = false, timer = null;
  function scheduleSync(ms) { clearTimeout(timer); timer = setTimeout(sync, ms || 0); }
  async function sync() {
    if (syncing) { again = true; return; }
    status.pending = [...mem.values()].filter((r) => r.dirty).length;
    if (!CFG.googleClientId) { status.state = "noconfig"; emitStatus(); return; }
    if (!navigator.onLine) { status.state = "offline"; emitStatus(); return; }
    if (!token()) { status.state = ls.get("ldg_signed_in") ? "expired" : "signedout"; emitStatus(); return; }
    syncing = true; status.state = "syncing"; emitStatus();
    try {
      const remote = await listRemote();
      const paths = new Set([...remote.keys(), ...mem.keys()]);
      for (const path of paths) {
        const R = remote.get(path);
        let L = mem.get(path);
        if (R && (!L || R.t !== L.syncedT)) {
          const rc = await download(R.id);
          L = mem.get(path);
          let rec;
          if (L && L.dirty) {
            const data = isMonths(path) ? mergeMonths(L.data, rc.data) : (L.t >= (rc.t || 0) ? L.data : rc.data);
            rec = { path, data, t: Date.now(), dirty: true, syncedT: R.t };
          } else rec = { path, data: rc.data, t: R.t, dirty: false, syncedT: R.t };
          mem.set(path, rec); await idbPut(rec); notify(path);
        }
        L = mem.get(path);
        if (L && L.dirty) {
          const sentT = L.t;
          const id = await upload(path, L, R && R.id);
          if (R) R.id = id;
          const now = mem.get(path);
          if (now && now.t === sentT) { now.dirty = false; now.syncedT = sentT; await idbPut(now); }
          else if (now) { now.syncedT = sentT; await idbPut(now); again = true; }
        }
      }
      status.last = Date.now(); ls.set("ldg_last_sync", String(status.last));
      status.state = "synced"; status.error = "";
    } catch (e) {
      status.state = e.code === "auth" || e.code === "scope" ? "expired" : navigator.onLine ? "error" : "offline";
      status.error = [e.code, e.reason, e.detail].filter(Boolean).join(" · ") || String(e);
      console.warn("sync failed", status.error);
    } finally {
      syncing = false;
      status.pending = [...mem.values()].filter((r) => r.dirty).length;
      emitStatus();
      if (again) { again = false; scheduleSync(1000); }
    }
  }
  window.addEventListener("online", () => scheduleSync(500));
  window.addEventListener("offline", () => { status.state = "offline"; emitStatus(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(800); });
  setInterval(() => { if (!document.hidden) sync(); }, 5 * 60 * 1000);

  /* ---------- 시작 ---------- */
  const ready = (async () => {
    idb = await openIdb();
    (await idbAll()).forEach((r) => mem.set(r.path, r));
    status.pending = [...mem.values()].filter((r) => r.dirty).length;
    // 토큰이 만료됐고 온라인이면, 한 번만 조용히 다시 로그인합니다.
    let silentTried = false;
    try { silentTried = !!sessionStorage.getItem("ldg_silent_tried"); } catch (_) {}
    if (CFG.googleClientId && navigator.onLine && !token() && ls.get("ldg_signed_in") && !silentTried) {
      const stale = Date.now() - status.last > 20 * 60 * 1000;
      if (status.pending || stale) {
        try { sessionStorage.setItem("ldg_silent_tried", "1"); } catch (_) {}
        login(true);
        return localDb;
      }
    }
    scheduleSync(300);
    return localDb;
  })();

  window.LedgerSync = {
    status: () => ({ ...status }),
    onStatus(f) { statusSubs.add(f); f({ ...status }); return () => statusSubs.delete(f); },
    syncNow: () => (token() ? sync() : login(false)),
    login: () => login(false),
    logout,
    hasConfig: () => !!CFG.googleClientId,
    _merge: { stampMonths, mergeMonths },
  };
  // 앱은 claude.ai와 같은 방식으로 저장소를 요청합니다.
  window.claude = { use: async (name) => (name === "db" ? ready : null) };
  document.documentElement.dataset.pwa = "1";
})();
