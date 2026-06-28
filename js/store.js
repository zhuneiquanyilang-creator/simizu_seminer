/* ============================================================
   データ層（ログインページ・アプリ本体で共通利用）
   - Supabase 設定済み → クラウドモード
   - 未設定           → デモモード（localStorage）
   window.AppStore として公開。
   ============================================================ */
window.AppStore = (function () {
  "use strict";
  const C = window.CONFIG;
  const USE_SUPABASE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && C.SHARED_EMAIL);

  function supabaseStore() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    return {
      mode: "supabase",
      async login(pw) {
        const { error } = await sb.auth.signInWithPassword({ email: C.SHARED_EMAIL, password: pw });
        return !error;
      },
      async logout() { await sb.auth.signOut(); },
      async isLoggedIn() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async getAssignments() {
        const { data, error } = await sb.from("assignments").select("*");
        if (error) throw error;
        const map = {};
        (data || []).forEach((r) => { map[r.section_id] = r; });
        return map;
      },
      async saveAssignment(id, v) {
        const row = { section_id: id, assignee: v.assignee || null, present_date: v.present_date || null, status: v.status, updated_at: new Date().toISOString() };
        const { error } = await sb.from("assignments").upsert(row);
        if (error) throw error;
      },
      async getResumes() {
        const { data, error } = await sb.from("resumes").select("*").order("created_at");
        if (error) throw error;
        const map = {};
        (data || []).forEach((r) => {
          const ids = (r.section_ids && r.section_ids.length) ? r.section_ids : [r.section_id];
          ids.forEach((id) => { (map[id] = map[id] || []).push(r); });
        });
        return map;
      },
      async uploadResume(id, file, uploader, sectionIds) {
        // 保存キーはASCII安全に（日本語/空白などはストレージが拒否するため）。
        // 表示名は元のファイル名を file_name に保持する。
        const ids = (sectionIds && sectionIds.length) ? sectionIds : [id];
        const safeId = id.replace(/[^\w.\-]/g, "_");
        const safeName = (file.name || "file.pdf").replace(/[^\w.\-]/g, "_");
        const path = `${safeId}/${Date.now()}_${safeName}`;
        const up = await sb.storage.from("resumes").upload(path, file, { contentType: "application/pdf" });
        if (up.error) throw up.error;
        const { error } = await sb.from("resumes").insert({
          section_id: id, section_ids: ids, file_name: file.name, uploader: uploader || null,
          storage_path: path, file_size: file.size,
        });
        if (error) throw error;
      },
      async updateResumeSections(r, sectionIds) {
        const ids = (sectionIds && sectionIds.length) ? sectionIds : [r.section_id];
        const { error } = await sb.from("resumes").update({ section_ids: ids }).eq("id", r.id);
        if (error) throw error;
      },
      async resumeUrl(r) {
        const { data, error } = await sb.storage.from("resumes").createSignedUrl(r.storage_path, 60 * 30);
        if (error) throw error;
        return data.signedUrl;
      },
      async deleteResume(r) {
        await sb.storage.from("resumes").remove([r.storage_path]);
        const { error } = await sb.from("resumes").delete().eq("id", r.id);
        if (error) throw error;
      },
    };
  }

  function demoStore() {
    const KEY_A = "shimizu_demo_assignments";
    const KEY_R = "shimizu_demo_resumes";
    // localStorage が使えない環境でもメモリで動く
    const mem = {};
    const ls = {
      get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
      del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
    };
    const load = (k) => { try { return JSON.parse(ls.get(k)) || {}; } catch { return {}; } };
    const save = (k, v) => ls.set(k, JSON.stringify(v));
    const blobs = {};
    return {
      mode: "demo",
      async login(pw) { if (!pw) return false; ls.set("shimizu_demo_session", "1"); return true; },
      async logout() { ls.del("shimizu_demo_session"); },
      async isLoggedIn() { return ls.get("shimizu_demo_session") === "1"; },
      async getAssignments() { return load(KEY_A); },
      async saveAssignment(id, v) {
        const a = load(KEY_A);
        a[id] = { section_id: id, assignee: v.assignee || null, present_date: v.present_date || null, status: v.status };
        save(KEY_A, a);
      },
      // デモは「レジュメ配列」を1つ持ち、section_ids で複数節に展開する
      async getResumes() {
        const arr = load(KEY_R).items || [];
        const map = {};
        arr.forEach((r) => {
          const ids = (r.section_ids && r.section_ids.length) ? r.section_ids : [r.section_id];
          ids.forEach((id) => { (map[id] = map[id] || []).push(r); });
        });
        return map;
      },
      async uploadResume(id, file, uploader, sectionIds) {
        const ids = (sectionIds && sectionIds.length) ? sectionIds : [id];
        const store = load(KEY_R); store.items = store.items || [];
        const rid = "d" + Date.now();
        store.items.push({ id: rid, section_id: id, section_ids: ids, file_name: file.name, uploader: uploader || null, file_size: file.size });
        save(KEY_R, store);
        blobs[rid] = URL.createObjectURL(file);
      },
      async updateResumeSections(r, sectionIds) {
        const ids = (sectionIds && sectionIds.length) ? sectionIds : [r.section_id];
        const store = load(KEY_R); store.items = store.items || [];
        const t = store.items.find((x) => x.id === r.id);
        if (t) { t.section_ids = ids; save(KEY_R, store); }
      },
      async resumeUrl(r) { return blobs[r.id] || null; },
      async deleteResume(r) {
        const store = load(KEY_R); store.items = (store.items || []).filter((x) => x.id !== r.id);
        save(KEY_R, store);
      },
    };
  }

  return USE_SUPABASE ? supabaseStore() : demoStore();
})();
