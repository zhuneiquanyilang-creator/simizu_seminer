-- レジュメを「複数の節」に紐づけられるようにする列を追加。
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- 既存レジュメは、これまでの section_id を section_ids に引き継ぎます。

alter table public.resumes add column if not exists section_ids text[];

-- 既存行のバックフィル（section_ids 未設定なら、その節1つを入れる）
update public.resumes
  set section_ids = array[section_id]
  where section_ids is null or array_length(section_ids, 1) is null;

-- 検索を速くするためのインデックス（任意）
create index if not exists resumes_section_ids_idx on public.resumes using gin (section_ids);
