/* ============================================================
   アプリ本体ページ（app.html）
   担当一覧（②）と節詳細（③）。データ層は js/store.js の AppStore。
   未ログインなら index.html（ログイン）へ戻す。
   ============================================================ */
(() => {
  "use strict";

  const C = window.CONFIG;
  const TOC = window.TOC;
  const Store = window.AppStore;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  // 全節をフラットに（id -> {chapter, section}）
  const SECTION_INDEX = {};
  TOC.chapters.forEach((ch) => ch.sections.forEach((s) => {
    SECTION_INDEX[s.id] = { chapter: ch, section: s };
  }));

  // 状態キャッシュ
  let assignments = {};
  let resumes = {};
  let currentSectionId = null;

  function showView(view) {
    $("view-list").hidden = view !== "list";
    $("view-detail").hidden = view !== "detail";
    window.scrollTo(0, 0);
  }

  async function init() {
    // 未ログインならログインページへ
    let loggedIn = false;
    try { loggedIn = await Store.isLoggedIn(); } catch {}
    if (!loggedIn) { location.replace("index.html"); return; }

    $("brand").textContent = C.SITE_NAME;
    $("brand-sub").textContent = "非線形ダイナミクスとカオス";
    $("max-mb").textContent = C.MAX_FILE_MB;
    if (Store.mode === "demo") $("mode-badge").hidden = false;

    bindEvents();
    await refreshData();
    renderList();
    showView("list");
  }

  function bindEvents() {
    $("logout-btn").addEventListener("click", onLogout);
    $("back-btn").addEventListener("click", () => { renderList(); showView("list"); });
    $("filter-assignee").addEventListener("change", renderChapters);
    $("filter-status").addEventListener("change", renderChapters);
    $("filter-text").addEventListener("input", renderChapters);
    $("d-save").addEventListener("click", onSaveAssignment);
    $("upload-btn").addEventListener("click", onUpload);
  }

  async function onLogout() {
    try { await Store.logout(); } catch {}
    location.href = "index.html";
  }

  async function refreshData() {
    [assignments, resumes] = await Promise.all([Store.getAssignments(), Store.getResumes()]);
  }

  /* ---------- 担当者候補 ---------- */
  function knownAssignees() {
    const set = new Set((C.MEMBERS || []).filter(Boolean));
    Object.values(assignments).forEach((a) => { if (a.assignee) set.add(a.assignee); });
    return [...set].sort();
  }
  function statusOf(id) { return (assignments[id] && assignments[id].status) || "担当未決定"; }
  function assigneeOf(id) { return (assignments[id] && assignments[id].assignee) || ""; }
  function dateOf(id) { return (assignments[id] && assignments[id].present_date) || ""; }

  /* ---------- ② 担当一覧 ---------- */
  function renderList() {
    const sel = $("filter-assignee");
    const cur = sel.value;
    sel.innerHTML = '<option value="">全員</option>';
    knownAssignees().forEach((n) => { const o = el("option", null, n); o.value = n; sel.appendChild(o); });
    sel.value = cur;

    renderNextBanner();
    renderChapters();
  }

  function renderNextBanner() {
    const today = new Date().toISOString().slice(0, 10);
    let next = null;
    Object.values(assignments).forEach((a) => {
      if (!a.present_date || a.status === "発表済み") return;
      if (a.present_date < today) return;
      if (!next || a.present_date < next.present_date) next = a;
    });
    const banner = $("next-banner");
    if (!next) { banner.hidden = true; return; }
    const info = SECTION_INDEX[next.section_id];
    banner.hidden = false;
    banner.innerHTML = "";
    banner.appendChild(el("span", null, "次回の発表　"));
    banner.appendChild(el("b", null, `${fmtDate(next.present_date)}　${next.section_id} ${info ? info.section.title : ""}`));
    banner.appendChild(el("span", null, `　担当: ${next.assignee || "未定"}`));
  }

  function renderChapters() {
    const fA = $("filter-assignee").value;
    const fS = $("filter-status").value;
    const fT = $("filter-text").value.trim();
    const wrap = $("chapters");
    wrap.innerHTML = "";
    let lastPart = null;

    TOC.chapters.forEach((ch) => {
      const rows = ch.sections.filter((s) => {
        if (fA && assigneeOf(s.id) !== fA) return false;
        if (fS && statusOf(s.id) !== fS) return false;
        if (fT && !s.title.includes(fT) && !s.id.includes(fT)) return false;
        return true;
      });
      if (rows.length === 0) return;

      if (ch.part && ch.part !== lastPart) {
        wrap.appendChild(el("div", "part-head", ch.part));
        lastPart = ch.part;
      }

      const card = el("div", "chapter");
      const head = el("div", "chapter-head", `${ch.number}. ${ch.title}`);
      if (ch.page) head.appendChild(el("span", "ch-page", `p.${ch.page}`));
      card.appendChild(head);

      const table = el("table", "sections");
      rows.forEach((s) => table.appendChild(sectionRow(s)));
      card.appendChild(table);
      wrap.appendChild(card);
    });

    if (!wrap.children.length) wrap.appendChild(el("p", "muted", "条件に合う節がありません。"));
  }

  function sectionRow(s) {
    const tr = el("tr", "clickable");
    tr.addEventListener("click", () => openDetail(s.id));
    tr.appendChild(el("td", "col-no", s.no));

    const tdTitle = el("td", null, s.title);
    const rs = resumes[s.id] || [];
    if (rs.length) tdTitle.appendChild(el("span", "has-resume", `📄${rs.length}`));
    tr.appendChild(tdTitle);

    tr.appendChild(el("td", "col-assignee", assigneeOf(s.id) || "―"));
    tr.appendChild(el("td", "col-date", dateOf(s.id) ? fmtDate(dateOf(s.id)) : "―"));

    const tdStatus = el("td", "col-status");
    tdStatus.appendChild(statusPill(statusOf(s.id)));
    tr.appendChild(tdStatus);
    return tr;
  }

  function statusPill(status) {
    const icons = { "担当未決定": "⚪", "準備中": "🔵", "未完了": "🟡", "発表済み": "✅" };
    const span = el("span", "status", `${icons[status] || ""} ${status}`);
    span.dataset.s = status;
    return span;
  }

  /* ---------- ③ 節の詳細 ---------- */
  function openDetail(id) {
    currentSectionId = id;
    const { chapter, section } = SECTION_INDEX[id];

    $("detail-title").textContent = `${section.no === "演習" ? "" : section.no + "　"}${section.title}`;
    const partStr = chapter.part ? chapter.part + " / " : "";
    const pageStr = section.page ? ` p.${section.page}` : "";
    $("detail-meta").textContent = `${partStr}${chapter.number}章 ${chapter.title}${pageStr}`;

    const dl = $("assignee-options");
    dl.innerHTML = "";
    knownAssignees().forEach((n) => { const o = el("option"); o.value = n; dl.appendChild(o); });

    $("d-assignee").value = assigneeOf(id);
    $("d-date").value = dateOf(id);
    $("d-status").value = statusOf(id);
    $("d-saved").hidden = true;

    renderResumes();
    $("file-input").value = "";
    $("uploader").value = "";
    $("upload-msg").hidden = true;

    showView("detail");
  }

  async function onSaveAssignment() {
    const id = currentSectionId;
    const v = {
      assignee: $("d-assignee").value.trim(),
      present_date: $("d-date").value || null,
      status: $("d-status").value,
    };
    $("d-save").disabled = true;
    try {
      await Store.saveAssignment(id, v);
      assignments[id] = { section_id: id, ...v };
      const saved = $("d-saved"); saved.hidden = false;
      setTimeout(() => { saved.hidden = true; }, 2000);
    } catch (err) {
      alert("保存に失敗しました: " + (err.message || err));
    } finally {
      $("d-save").disabled = false;
    }
  }

  function renderResumes() {
    const list = $("resume-list");
    list.innerHTML = "";
    const rs = resumes[currentSectionId] || [];
    $("resume-empty").hidden = rs.length > 0;
    rs.forEach((r) => list.appendChild(resumeItem(r)));
  }

  function resumeItem(r) {
    const li = el("li");
    li.appendChild(el("span", "fname", "📄 " + r.file_name + (r.uploader ? `（${r.uploader}）` : "")));
    if (r.file_size) li.appendChild(el("span", "fsize", fmtSize(r.file_size)));

    const view = el("a", null, "表示");
    view.href = "#";
    view.addEventListener("click", async (e) => {
      e.preventDefault();
      const url = await Store.resumeUrl(r);
      if (url) window.open(url, "_blank");
      else alert("デモモードではリロード後にファイルを再表示できません（メタ情報のみ保存）。");
    });
    li.appendChild(view);

    const del = el("button", "del", "削除");
    del.addEventListener("click", async () => {
      if (!confirm(`「${r.file_name}」を削除しますか？`)) return;
      try {
        await Store.deleteResume(r);
        resumes[currentSectionId] = (resumes[currentSectionId] || []).filter((x) => x.id !== r.id);
        renderResumes();
      } catch (err) { alert("削除に失敗しました: " + (err.message || err)); }
    });
    li.appendChild(del);
    return li;
  }

  async function onUpload() {
    const f = $("file-input").files[0];
    if (!f) return showUploadMsg("ファイルを選択してください。");
    if (f.type !== "application/pdf") return showUploadMsg("PDFファイルのみアップロードできます。");
    if (f.size > C.MAX_FILE_MB * 1024 * 1024) return showUploadMsg(`ファイルが大きすぎます（上限 ${C.MAX_FILE_MB}MB）。`);

    $("upload-btn").disabled = true;
    showUploadMsg("アップロード中…");
    try {
      await Store.uploadResume(currentSectionId, f, $("uploader").value.trim());
      resumes = await Store.getResumes();
      renderResumes();
      $("file-input").value = "";
      showUploadMsg("アップロードしました。");
    } catch (err) {
      showUploadMsg("アップロードに失敗しました: " + (err.message || err));
    } finally {
      $("upload-btn").disabled = false;
    }
  }

  function showUploadMsg(t) { const m = $("upload-msg"); m.textContent = t; m.hidden = false; }

  /* ---------- ユーティリティ ---------- */
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + "B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + "KB";
    return (bytes / 1024 / 1024).toFixed(1) + "MB";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
