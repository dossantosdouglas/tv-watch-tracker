export type MediaType = "anime" | "series" | "movie";

export type WatchStatus =
  | "watching"
  | "completed"
  | "on_hold"
  | "plan_to_watch";

export type SourceApp = "crunchyroll" | "youcine" | "manual";

export type MetadataProvider =
  | "anilist"
  | "jikan"
  | "tvmaze"
  | "tmdb"
  | "manual";

export interface NextAiringInfo {
  episode: number;
  airing_at: string;
}

export interface WatchedEpisode {
  id: string;
  media_id: string;
  season: number;
  episode: number;
  episode_title: string | null;
  watched: boolean;
  source_app: SourceApp | null;
  position_sec: number | null;
  duration_sec: number | null;
  watched_at: string;
}

export interface CatalogEpisode {
  season: number;
  episode: number;
  abs_episode?: number;
  title: string | null;
  aired_at: string | null;
  air_date?: string | null;
  is_upcoming?: boolean;
  duration_min: number | null;
  thumbnail: string | null;
  overview: string | null;
  watched: boolean;
  watched_at: string | null;
  source_app: SourceApp | null;
  position_sec: number | null;
  duration_sec: number | null;
}

export interface MediaItem {
  id: string;
  title: string;
  normalized_title: string;
  aliases: string[];
  media_type: MediaType;
  status: WatchStatus;
  current_season: number;
  current_episode: number;
  total_episodes: number | null;
  cover_image: string | null;
  banner_image: string | null;
  synopsis: string | null;
  genres: string[];
  release_year: number | null;
  score: number | null;
  provider: MetadataProvider;
  external_id: string | null;
  mal_id: number | null;
  last_app: SourceApp;
  last_episode_title: string | null;
  last_position_sec: number | null;
  last_duration_sec: number | null;
  last_watched_at: string;
  created_at: string;
  updated_at: string;
  catalog_episodes?: CatalogEpisode[];
  catalog_updated_at?: string | null;
  next_airing?: NextAiringInfo | null;
  airing_status?: string | null;
  watched_episodes?: WatchedEpisode[];
}

export interface ScrobbleLog {
  id: string;
  media_id: string | null;
  app: string;
  raw_title: string | null;
  raw_episode_title: string | null;
  raw_text: string | null;
  parsed_title: string | null;
  parsed_season: number | null;
  parsed_episode: number | null;
  position_sec: number | null;
  duration_sec: number | null;
  playback_state: string | null;
  matched: boolean;
  created_at: string;
}

export interface ScrobblePayload {
  app: "crunchyroll" | "youcine" | string;
  title?: string;
  episodeTitle?: string;
  rawText?: string;
  season?: number | null;
  episode?: number | null;
  positionSec?: number | null;
  durationSec?: number | null;
  state?: string;
  timestamp?: string;
  apiKey?: string;
}

export interface SearchResult {
  provider: MetadataProvider;
  external_id: string;
  mal_id: number | null;
  title: string;
  title_native: string | null;
  aliases: string[];
  media_type: MediaType;
  total_episodes: number | null;
  cover_image: string | null;
  banner_image: string | null;
  synopsis: string | null;
  genres: string[];
  release_year: number | null;
  score: number | null;
  status_airing?: string | null;
  next_airing?: NextAiringInfo | null;
}

export type MediaPatchAction =
  | { action: "increment_episode" }
  | {
      action: "set_progress";
      season?: number;
      episode?: number;
      status?: WatchStatus;
      total_episodes?: number | null;
    }
  | {
      action: "toggle_episode";
      season?: number;
      episode: number;
      watched?: boolean;
      episode_title?: string | null;
    }
  | {
      action: "rematch";
      searchResult: SearchResult;
    };
