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
        (data || []).forEach((r) => { (map[r.section_id] = map[r.section_id] || []).push(r); });
        return map;
      },
      async uploadResume(id, file, uploader) {
        const path = `${id}/${Date.now()}_${file.name}`;
        const up = await sb.storage.from("resumes").upload(path, file);
        if (up.error) throw up.error;
        const { error } = await sb.from("resumes").insert({
          section_id: id, file_name: file.name, uploader: uploader || null,
          storage_path: path, file_size: file.size,
        });
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
      async getResumes() { return load(KEY_R); },
      async uploadResume(id, file, uploader) {
        const r = load(KEY_R);
        const rid = "d" + Date.now();
        (r[id] = r[id] || []).push({ id: rid, section_id: id, file_name: file.name, uploader: uploader || null, file_size: file.size });
        save(KEY_R, r);
        blobs[rid] = URL.createObjectURL(file);
      },
      async resumeUrl(r) { return blobs[r.id] || null; },
      async deleteResume(r) {
        const all = load(KEY_R);
        all[r.section_id] = (all[r.section_id] || []).filter((x) => x.id !== r.id);
        save(KEY_R, all);
      },
    };
  }

  return USE_SUPABASE ? supabaseStore() : demoStore();
})();
