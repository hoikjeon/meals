-- 점심 사진을 날짜별로 보관하는 테이블 (날짜당 1장)
-- Supabase 대시보드 > SQL Editor 에서 한 번 실행하세요.

create table if not exists public.lunch_photos (
  date       date primary key,
  image_url  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lunch_photos enable row level security;

-- 이 앱은 anon 키로만 동작하므로 기존 테이블과 동일한 접근 정책을 사용한다.
drop policy if exists "lunch_photos anon select" on public.lunch_photos;
create policy "lunch_photos anon select" on public.lunch_photos
  for select to anon using (true);

drop policy if exists "lunch_photos anon insert" on public.lunch_photos;
create policy "lunch_photos anon insert" on public.lunch_photos
  for insert to anon with check (true);

drop policy if exists "lunch_photos anon update" on public.lunch_photos;
create policy "lunch_photos anon update" on public.lunch_photos
  for update to anon using (true) with check (true);

drop policy if exists "lunch_photos anon delete" on public.lunch_photos;
create policy "lunch_photos anon delete" on public.lunch_photos
  for delete to anon using (true);
