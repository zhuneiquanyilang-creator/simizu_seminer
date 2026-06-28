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
    // アップロード対象の節チェックリスト（初期は現在の節をチェック）
    buildSectionChecklist($("upload-sections"), new Set([id]));

    showView("detail");
  }

  /* 節の複数選択チェックリストを container に描画。selectedSet は初期選択。 */
  function buildSectionChecklist(container, selectedSet) {
    container.innerHTML = "";
    TOC.chapters.forEach((ch) => {
      const grp = el("div", "pick-chapter");
      grp.appendChild(el("div", "pick-chapter-head", `${ch.number}. ${ch.title}`));
      ch.sections.forEach((s) => {
        const lab = el("label", "pick-item");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = s.id;
        if (selectedSet.has(s.id)) cb.checked = true;
        lab.appendChild(cb);
        lab.appendChild(el("span", null, `${s.no} ${s.title}`));
        grp.appendChild(lab);
      });
      container.appendChild(grp);
    });
  }

  function readChecklist(container) {
    return [...container.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
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

  async function renderResumes() {
    const list = $("resume-list");
    list.innerHTML = "";
    const rs = resumes[currentSectionId] || [];
    $("resume-empty").hidden = rs.length > 0;
    for (const r of rs) list.appendChild(await resumeItem(r));
  }

  function resumeSectionIds(r) {
    return (r.section_ids && r.section_ids.length) ? r.section_ids : [r.section_id];
  }

  async function resumeItem(r) {
    const li = el("li", "resume-li");
    const main = el("div", "resume-main");

    main.appendChild(el("span", "fname", "📄 " + r.file_name + (r.uploader ? `（${r.uploader}）` : "")));
    if (r.file_size) main.appendChild(el("span", "fsize", fmtSize(r.file_size)));

    // 表示リンクは事前にURLを用意して通常リンクにする
    // （await 後に window.open するとモバイルでポップアップブロックされるため）
    const view = el("a", null, "表示");
    view.target = "_blank";
    view.rel = "noopener";
    try {
      const url = await Store.resumeUrl(r);
      if (url) view.href = url;
      else { view.href = "#"; view.addEventListener("click", (e) => { e.preventDefault(); alert("デモモードではリロード後にファイルを再表示できません（メタ情報のみ保存）。"); }); }
    } catch (err) {
      view.href = "#";
      view.addEventListener("click", (e) => { e.preventDefault(); alert("表示用URLの取得に失敗しました: " + (err.message || err)); });
    }
    main.appendChild(view);

    const editBtn = el("button", "linkish", "対象節を編集");
    main.appendChild(editBtn);

    const del = el("button", "del", "削除");
    del.addEventListener("click", async () => {
      if (!confirm(`「${r.file_name}」を削除しますか？（紐づく全ての節から消えます）`)) return;
      try {
        await Store.deleteResume(r);
        resumes = await Store.getResumes();
        renderResumes();
      } catch (err) { alert("削除に失敗しました: " + (err.message || err)); }
    });
    main.appendChild(del);
    li.appendChild(main);

    // 対象節の表示
    const ids = resumeSectionIds(r);
    const cover = el("div", "resume-cover", "対象節: " + ids.join("、"));
    li.appendChild(cover);

    // 対象節の編集パネル（初期は隠す）
    const editor = el("div", "resume-edit");
    editor.hidden = true;
    const pick = el("div", "section-pick");
    const save = el("button", "primary small-btn", "保存");
    const cancel = el("button", "linkish", "キャンセル");
    const editRow = el("div", "edit-row");
    editRow.appendChild(save); editRow.appendChild(cancel);
    editor.appendChild(pick);
    editor.appendChild(editRow);
    li.appendChild(editor);

    editBtn.addEventListener("click", () => {
      if (editor.hidden) { buildSectionChecklist(pick, new Set(resumeSectionIds(r))); editor.hidden = false; }
      else editor.hidden = true;
    });
    cancel.addEventListener("click", () => { editor.hidden = true; });
    save.addEventListener("click", async () => {
      const sel = readChecklist(pick);
      if (!sel.length) { alert("少なくとも1つの節を選んでください。"); return; }
      save.disabled = true;
      try {
        await Store.updateResumeSections(r, sel);
        resumes = await Store.getResumes();
        renderResumes();
      } catch (err) { alert("更新に失敗しました: " + (err.message || err)); }
      finally { save.disabled = false; }
    });

    return li;
  }

  async function onUpload() {
    const f = $("file-input").files[0];
    if (!f) return showUploadMsg("ファイルを選択してください。");
    if (f.type !== "application/pdf") return showUploadMsg("PDFファイルのみアップロードできます。");
    if (f.size > C.MAX_FILE_MB * 1024 * 1024) return showUploadMsg(`ファイルが大きすぎます（上限 ${C.MAX_FILE_MB}MB）。`);

    let sectionIds = readChecklist($("upload-sections"));
    if (!sectionIds.length) sectionIds = [currentSectionId]; // 最低1つ
    if (!sectionIds.includes(currentSectionId)) sectionIds.push(currentSectionId);

    $("upload-btn").disabled = true;
    showUploadMsg("アップロード中…");
    try {
      await Store.uploadResume(currentSectionId, f, $("uploader").value.trim(), sectionIds);
      resumes = await Store.getResumes();
      renderResumes();
      $("file-input").value = "";
      buildSectionChecklist($("upload-sections"), new Set([currentSectionId]));
      showUploadMsg(`アップロードしました（対象 ${sectionIds.length} 節）。`);
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
