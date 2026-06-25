/* ログインページ（index.html）専用ロジック */
(() => {
  "use strict";
  const C = window.CONFIG;
  const $ = (id) => document.getElementById(id);

  function showErr(msg) { const e = $("login-error"); e.textContent = msg; e.hidden = false; }

  async function init() {
    $("login-title").textContent = C.SITE_NAME;
    $("login-sub").textContent = C.SUBTITLE;
    if (AppStore.mode === "demo") {
      $("login-note").textContent = "※ デモモード：任意の合言葉で入室できます（データはこのブラウザのみ）";
    }
    // すでにログイン済みならアプリへ
    try { if (await AppStore.isLoggedIn()) { location.replace("app.html"); return; } } catch {}
    $("login-form").addEventListener("submit", onLogin);
  }

  async function onLogin(e) {
    e.preventDefault();
    const pw = $("password").value;
    $("login-error").hidden = true;
    $("login-btn").disabled = true;
    try {
      const ok = await AppStore.login(pw);
      if (!ok) { showErr("合言葉が違います"); return; }
      location.href = "app.html";   // ← 入室したらアプリ本体ページへ遷移
    } catch (err) {
      showErr("ログインに失敗しました: " + (err.message || err));
    } finally {
      $("login-btn").disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
