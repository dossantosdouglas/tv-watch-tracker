-- TV Watch Tracker Schema (Supabase / PostgreSQL)

create extension if not exists pgcrypto;

create table if not exists public.tv_watch_media (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  normalized_title text not null,
  aliases text[] not null default '{}',
  media_type text not null default 'anime' check (media_type in ('anime', 'series', 'movie')),
  status text not null default 'watching' check (status in ('watching', 'completed', 'on_hold', 'plan_to_watch')),
  current_season integer not null default 1,
  current_episode integer not null default 0,
  total_episodes integer,
  cover_image text,
  banner_image text,
  synopsis text,
  genres text[] not null default '{}',
  release_year integer,
  score numeric(4,1),
  provider text not null default 'manual' check (provider in ('anilist', 'jikan', 'tvmaze', 'tmdb', 'manual')),
  external_id text,
  mal_id integer,
  last_app text not null default 'manual' check (last_app in ('crunchyroll', 'youcine', 'manual')),
  last_episode_title text,
  last_position_sec integer,
  last_duration_sec integer,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tv_watch_media_normalized_title
  on public.tv_watch_media (normalized_title);

create index if not exists idx_tv_watch_media_last_watched_at
  on public.tv_watch_media (last_watched_at desc);

create index if not exists idx_tv_watch_media_provider_ext
  on public.tv_watch_media (provider, external_id);

create table if not exists public.tv_watch_episodes (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.tv_watch_media(id) on delete cascade,
  season integer not null default 1,
  episode integer not null,
  episode_title text,
  watched boolean not null default true,
  source_app text check (source_app in ('crunchyroll', 'youcine', 'manual')),
  position_sec integer,
  duration_sec integer,
  watched_at timestamptz not null default now(),
  constraint uq_tv_watch_episodes_media_season_ep unique (media_id, season, episode)
);

create index if not exists idx_tv_watch_episodes_media
  on public.tv_watch_episodes (media_id, season, episode);

create table if not exists public.tv_watch_scrobble_logs (
  id uuid primary key default gen_random_uuid(),
  media_id uuid references public.tv_watch_media(id) on delete set null,
  app text not null,
  raw_title text,
  raw_episode_title text,
  raw_text text,
  parsed_title text,
  parsed_season integer,
  parsed_episode integer,
  position_sec integer,
  duration_sec integer,
  playback_state text,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_tv_watch_scrobble_logs_created_at
  on public.tv_watch_scrobble_logs (created_at desc);

create or replace function public.set_tv_watch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tv_watch_media_updated_at on public.tv_watch_media;
create trigger trg_tv_watch_media_updated_at
  before update on public.tv_watch_media
  for each row execute function public.set_tv_watch_updated_at();

alter table public.tv_watch_media enable row level security;
alter table public.tv_watch_episodes enable row level security;
alter table public.tv_watch_scrobble_logs enable row level security;
