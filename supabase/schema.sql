-- ============================================================
--  清水研究室 輪読サポートサイト  Supabase スキーマ
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- ============================================================

-- 1. 担当情報（節ごと。section_id は toc-data.js の id と一致させる）
create table if not exists public.assignments (
  section_id   text primary key,
  assignee     text,
  present_date date,
  status       text not null default '担当未決定'
               check (status in ('担当未決定','準備中','未完了','発表済み')),
  updated_at   timestamptz not null default now()
);

-- 2. レジュメ（PDF）。1つの節に複数ファイル可
create table if not exists public.resumes (
  id           uuid primary key default gen_random_uuid(),
  section_id   text not null,
  file_name    text not null,
  uploader     text,
  storage_path text not null,          -- Storage バケット内のパス
  file_size    integer,
  created_at   timestamptz not null default now()
);
create index if not exists resumes_section_idx on public.resumes (section_id);

-- ============================================================
--  RLS（行レベルセキュリティ）
--  共有アカウントでログイン（authenticated）した人のみ読み書き可。
--  未ログイン（anon）は一切アクセス不可。
-- ============================================================
alter table public.assignments enable row level security;
alter table public.resumes      enable row level security;

drop policy if exists "auth full access" on public.assignments;
create policy "auth full access" on public.assignments
  for all to authenticated using (true) with check (true);

drop policy if exists "auth full access" on public.resumes;
create policy "auth full access" on public.resumes
  for all to authenticated using (true) with check (true);

-- ============================================================
--  Storage バケット（レジュメPDF置き場・非公開）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "auth read resumes" on storage.objects;
create policy "auth read resumes" on storage.objects
  for select to authenticated using (bucket_id = 'resumes');

drop policy if exists "auth write resumes" on storage.objects;
create policy "auth write resumes" on storage.objects
  for insert to authenticated with check (bucket_id = 'resumes');

drop policy if exists "auth delete resumes" on storage.objects;
create policy "auth delete resumes" on storage.objects
  for delete to authenticated using (bucket_id = 'resumes');

-- ============================================================
--  ログイン用の共有アカウント作成（SQLでは作れません）
--  Supabase ダッシュボード → Authentication → Users → Add user で
--  メール = config.js の SHARED_EMAIL、パスワード = 輪読会の「合言葉」
--  を登録してください（"Auto Confirm User" にチェック）。
-- ============================================================
