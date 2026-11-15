import {
  CatalogEpisode,
  MediaItem,
  MediaType,
  SearchResult,
  SourceApp,
} from "./types";
import { normalizeTitle } from "./parser";

const FETCH_TIMEOUT_MS = 8000;

function stripHtml(html?: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleSimilarityScore(query: string, candidates: string[]): number {
  const nq = normalizeTitle(query);
  if (!nq) return 0;

  let best = 0;
  const qTokens = new Set(nq.split(" ").filter(Boolean));

  for (const cand of candidates) {
    const nc = normalizeTitle(cand);
    if (!nc) continue;

    if (nc === nq) return 100;
    if (nc.startsWith(nq) || nq.startsWith(nc)) {
      best = Math.max(best, 85);
      continue;
    }
    if (nc.includes(nq) || nq.includes(nc)) {
      best = Math.max(best, 72);
      continue;
    }

    const cTokens = new Set(nc.split(" ").filter(Boolean));
    let overlap = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) overlap++;
    }
    if (overlap > 0) {
      const union = new Set([...qTokens, ...cTokens]).size;
      const jaccard = Math.round((overlap / union) * 65);
      best = Math.max(best, jaccard);
    }
  }

  return best;
}

// ============================================================================
// 1. AniList GraphQL API
// ============================================================================

interface AniListMediaNode {
  id: number;
  idMal: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  synonyms: string[] | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
  } | null;
  bannerImage: string | null;
  episodes: number | null;
  status: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  genres: string[] | null;
  description: string | null;
  format: string | null;
  streamingEpisodes?: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
  }> | null;
}

function mapAniListToSearchResult(node: AniListMediaNode): SearchResult {
  const title =
    node.title.english || node.title.romaji || node.title.native || "Sem Título";
  const aliases = Array.from(
    new Set(
      [
        node.title.romaji,
        node.title.english,
        node.title.native,
        ...(node.synonyms || []),
      ].filter((v): v is string => Boolean(v && v.trim()))
    )
  );

  return {
    provider: "anilist",
    external_id: String(node.id),
    mal_id: node.idMal,
    title,
    title_native: node.title.native,
    aliases,
    media_type: node.format === "MOVIE" ? "movie" : "anime",
    total_episodes: node.episodes,
    cover_image: node.coverImage?.extraLarge || node.coverImage?.large || null,
    banner_image: node.bannerImage || null,
    synopsis: stripHtml(node.description),
    genres: node.genres || [],
    release_year: node.seasonYear,
    score:
      typeof node.averageScore === "number"
        ? Math.round(node.averageScore) / 10
        : null,
    status_airing: node.status,
  };
}

export async function searchAniList(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  const gql = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          format
          title {
            romaji
            english
            native
          }
          synonyms
          coverImage {
            extraLarge
            large
          }
          bannerImage
          episodes
          status
          seasonYear
          averageScore
          genres
          description(asHtml: false)
        }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: gql,
        variables: { search: query, perPage: limit },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { Page?: { media?: AniListMediaNode[] } };
    };
    const nodes = json.data?.Page?.media || [];
    return nodes.map(mapAniListToSearchResult);
  } catch {
    return [];
  }
}

async function fetchAniListMediaById(
  id: number
): Promise<AniListMediaNode | null> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        format
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          extraLarge
          large
        }
        bannerImage
        episodes
        status
        seasonYear
        averageScore
        genres
        description(asHtml: false)
        streamingEpisodes {
          title
          thumbnail
          url
        }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: gql, variables: { id } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Media?: AniListMediaNode };
    };
    return json.data?.Media || null;
  } catch {
    return null;
  }
}

// ============================================================================
// 2. Jikan API v4 (MyAnimeList)
// ============================================================================

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[] | null;
  type: string | null;
  episodes: number | null;
  status: string | null;
  year: number | null;
  score: number | null;
  synopsis: string | null;
  genres: Array<{ name: string }> | null;
  images: {
    jpg?: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  } | null;
}

export async function searchJikan(
  query: string,
  limit = 6
): Promise<SearchResult[]> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(
      query
    )}&limit=${limit}&sfw=true`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: JikanAnime[] };
    const items = json.data || [];

    return items.map((item) => {
      const title = item.title_english || item.title;
      const aliases = Array.from(
        new Set(
          [
            item.title,
            item.title_english,
            item.title_japanese,
            ...(item.title_synonyms || []),
          ].filter((v): v is string => Boolean(v && v.trim()))
        )
      );
      return {
        provider: "jikan",
        external_id: String(item.mal_id),
        mal_id: item.mal_id,
        title,
        title_native: item.title_japanese,
        aliases,
        media_type: item.type === "Movie" ? "movie" : "anime",
        total_episodes: item.episodes,
        cover_image:
          item.images?.webp?.large_image_url ||
          item.images?.jpg?.large_image_url ||
          item.images?.jpg?.image_url ||
          null,
        banner_image: null,
        synopsis: item.synopsis,
        genres: (item.genres || []).map((g) => g.name),
        release_year: item.year,
        score: item.score,
        status_airing: item.status,
      };
    });
  } catch {
    return [];
  }
}

interface JikanEpisode {
  mal_id: number;
  title: string | null;
  title_romanji: string | null;
  aired: string | null;
}

async function fetchJikanEpisodes(
  malId: number,
  maxPages = 2
): Promise<
  Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
  }>
> {
  const episodes: Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
  }> = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`,
        {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          cache: "no-store",
        }
      );
      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: JikanEpisode[];
        pagination?: { has_next_page?: boolean };
      };
      for (const ep of json.data || []) {
        episodes.push({
          season: 1,
          episode: ep.mal_id,
          title: ep.title || ep.title_romanji || null,
          aired_at: ep.aired ? ep.aired.slice(0, 10) : null,
        });
      }
      if (!json.pagination?.has_next_page) break;
    } catch {
      break;
    }
  }

  return episodes;
}

// ============================================================================
// 3. TVMaze API (100% free, no key required)
// ============================================================================

interface TVMazeShow {
  id: number;
  name: string;
  type: string | null;
  genres: string[] | null;
  status: string | null;
  premiered: string | null;
  rating: { average: number | null } | null;
  image: { original?: string; medium?: string } | null;
  summary: string | null;
  _embedded?: {
    episodes?: Array<{
      id: number;
      season: number;
      number: number;
      name: string | null;
      airdate: string | null;
      runtime: number | null;
      image: { medium?: string; original?: string } | null;
      summary: string | null;
    }>;
  };
}

export async function searchTVMaze(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ show: TVMazeShow }>;
    return json.slice(0, limit).map(({ show }) => ({
      provider: "tvmaze",
      external_id: String(show.id),
      mal_id: null,
      title: show.name,
      title_native: null,
      aliases: [show.name],
      media_type: "series",
      total_episodes: null,
      cover_image: show.image?.original || show.image?.medium || null,
      banner_image: null,
      synopsis: stripHtml(show.summary),
      genres: show.genres || [],
      release_year: show.premiered ? parseInt(show.premiered.slice(0, 4), 10) : null,
      score: show.rating?.average ?? null,
      status_airing: show.status,
    }));
  } catch {
    return [];
  }
}

async function fetchTVMazeShowWithEpisodes(
  showId: string
): Promise<TVMazeShow | null> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/shows/${encodeURIComponent(
        showId
      )}?embed=episodes`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as TVMazeShow;
  } catch {
    return null;
  }
}

// ============================================================================
// 4. Optional TMDB API (only when process.env.TMDB_API_KEY is configured)
// ============================================================================

interface TMDBMultiItem {
  id: number;
  media_type: "tv" | "movie" | "person";
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  release_date?: string;
  vote_average?: number;
}

export async function searchTMDB(
  query: string,
  limit = 6
): Promise<SearchResult[]> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) return [];

  try {
    const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(
      query
    )}&language=pt-BR&api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: TMDBMultiItem[] };
    const filtered = (json.results || []).filter(
      (r) => r.media_type === "tv" || r.media_type === "movie"
    );

    return filtered.slice(0, limit).map((item) => {
      const title = item.name || item.title || "Sem Título";
      const orig = item.original_name || item.original_title || null;
      const dateStr = item.first_air_date || item.release_date || "";
      return {
        provider: "tmdb",
        external_id: `${item.media_type}:${item.id}`,
        mal_id: null,
        title,
        title_native: orig,
        aliases: [title, orig].filter((v): v is string => Boolean(v)),
        media_type: item.media_type === "movie" ? "movie" : "series",
        total_episodes: item.media_type === "movie" ? 1 : null,
        cover_image: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : null,
        banner_image: item.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
          : null,
        synopsis: item.overview || null,
        genres: [],
        release_year: dateStr ? parseInt(dateStr.slice(0, 4), 10) : null,
        score:
          typeof item.vote_average === "number"
            ? Math.round(item.vote_average * 10) / 10
            : null,
      };
    });
  } catch {
    return [];
  }
}

// ============================================================================
// Unified Search, Best Match & Episode Catalog Fetchers
// ============================================================================

export async function searchMetadata(
  query: string,
  type: "anime" | "series" | "all" = "all"
): Promise<SearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  if (type === "anime") {
    const [anilist, jikan] = await Promise.all([
      searchAniList(cleanQ, 8),
      searchJikan(cleanQ, 5),
    ]);
    // Deduplicate Jikan entries already returned by AniList via mal_id
    const seenMal = new Set(
      anilist.map((a) => a.mal_id).filter((id): id is number => id !== null)
    );
    return [
      ...anilist,
      ...jikan.filter((j) => !j.mal_id || !seenMal.has(j.mal_id)),
    ];
  }

  if (type === "series") {
    const [tvmaze, tmdb] = await Promise.all([
      searchTVMaze(cleanQ, 8),
      searchTMDB(cleanQ, 5),
    ]);
    return [...tvmaze, ...tmdb];
  }

  const [anilist, tvmaze, tmdb] = await Promise.all([
    searchAniList(cleanQ, 6),
    searchTVMaze(cleanQ, 6),
    searchTMDB(cleanQ, 4),
  ]);

  let combined = [...anilist, ...tvmaze, ...tmdb];
  if (combined.length === 0) {
    combined = await searchJikan(cleanQ, 5);
  }

  return combined.sort((a, b) => {
    const sa = titleSimilarityScore(cleanQ, [a.title, ...a.aliases]);
    const sb = titleSimilarityScore(cleanQ, [b.title, ...b.aliases]);
    return sb - sa;
  });
}

export async function findBestMetadataMatch(
  title: string,
  app: SourceApp,
  mediaTypeHint: MediaType
): Promise<SearchResult | null> {
  const cleanQ = title.trim();
  if (!cleanQ || cleanQ === "Título Desconhecido") return null;

  let candidates: SearchResult[] = [];
  if (app === "crunchyroll" || mediaTypeHint === "anime") {
    candidates = await searchMetadata(cleanQ, "anime");
    if (candidates.length === 0) {
      candidates = await searchMetadata(cleanQ, "all");
    }
  } else {
    candidates = await searchMetadata(cleanQ, "all");
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = titleSimilarityScore(cleanQ, [best.title, ...best.aliases]);

  for (const cand of candidates.slice(1)) {
    const s = titleSimilarityScore(cleanQ, [cand.title, ...cand.aliases]);
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  // Enrich TVMaze total_episodes if TVMaze was selected
  if (best.provider === "tvmaze" && best.total_episodes === null) {
    const show = await fetchTVMazeShowWithEpisodes(best.external_id);
    if (show?._embedded?.episodes) {
      best.total_episodes = show._embedded.episodes.length;
    }
  }

  return bestScore >= 25 ? best : candidates[0];
}

function parseStreamingEpNumber(title: string | null): {
  episode: number | null;
  cleanTitle: string | null;
} {
  if (!title) return { episode: null, cleanTitle: null };
  const match = title.match(/^(?:Episode|Epis[oó]dio|Ep\.?)\s*(\d+)\s*[-–—:]?\s*(.*)$/i);
  if (match) {
    return {
      episode: parseInt(match[1], 10),
      cleanTitle: match[2]?.trim() || title,
    };
  }
  return { episode: null, cleanTitle: title };
}

export async function fetchCatalogEpisodes(
  media: Pick<
    MediaItem,
    | "provider"
    | "external_id"
    | "mal_id"
    | "total_episodes"
    | "current_season"
    | "current_episode"
  >
): Promise<
  Array<
    Omit<
      CatalogEpisode,
      "watched" | "watched_at" | "source_app" | "position_sec" | "duration_sec"
    >
  >
> {
  const map = new Map<
    string,
    Omit<
      CatalogEpisode,
      "watched" | "watched_at" | "source_app" | "position_sec" | "duration_sec"
    >
  >();

  const putEp = (
    season: number,
    episode: number,
    patch: Partial<
      Omit<
        CatalogEpisode,
        "watched" | "watched_at" | "source_app" | "position_sec" | "duration_sec"
      >
    >
  ) => {
    const key = `${season}:${episode}`;
    const prev = map.get(key);
    map.set(key, {
      season,
      episode,
      title: patch.title ?? prev?.title ?? null,
      aired_at: patch.aired_at ?? prev?.aired_at ?? null,
      duration_min: patch.duration_min ?? prev?.duration_min ?? null,
      thumbnail: patch.thumbnail ?? prev?.thumbnail ?? null,
      overview: patch.overview ?? prev?.overview ?? null,
    });
  };

  if (media.provider === "anilist" && media.external_id) {
    const aniId = parseInt(media.external_id, 10);
    if (!Number.isNaN(aniId)) {
      const ani = await fetchAniListMediaById(aniId);
      if (ani?.streamingEpisodes) {
        ani.streamingEpisodes.forEach((se, idx) => {
          const parsed = parseStreamingEpNumber(se.title);
          const epNum = parsed.episode ?? idx + 1;
          putEp(1, epNum, {
            title: parsed.cleanTitle || se.title || null,
            thumbnail: se.thumbnail || null,
          });
        });
      }
      const malId = media.mal_id || ani?.idMal || null;
      if (malId) {
        const jikanEps = await fetchJikanEpisodes(malId, 2);
        for (const je of jikanEps) {
          putEp(1, je.episode, {
            title: je.title,
            aired_at: je.aired_at,
          });
        }
      }
    }
  } else if (media.provider === "jikan" && media.external_id) {
    const malId = parseInt(media.external_id, 10);
    if (!Number.isNaN(malId)) {
      const jikanEps = await fetchJikanEpisodes(malId, 2);
      for (const je of jikanEps) {
        putEp(1, je.episode, {
          title: je.title,
          aired_at: je.aired_at,
        });
      }
    }
  } else if (media.provider === "tvmaze" && media.external_id) {
    const show = await fetchTVMazeShowWithEpisodes(media.external_id);
    for (const ep of show?._embedded?.episodes || []) {
      if (typeof ep.number === "number" && ep.number > 0) {
        putEp(ep.season || 1, ep.number, {
          title: ep.name || null,
          aired_at: ep.airdate || null,
          duration_min: ep.runtime ?? null,
          thumbnail: ep.image?.medium || ep.image?.original || null,
          overview: stripHtml(ep.summary),
        });
      }
    }
  } else if (
    media.provider === "tmdb" &&
    media.external_id &&
    process.env.TMDB_API_KEY
  ) {
    const [kind, tmdbId] = media.external_id.split(":");
    if (kind === "tv" && tmdbId) {
      try {
        const seasonNum = media.current_season || 1;
        const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?language=pt-BR&api_key=${encodeURIComponent(
          process.env.TMDB_API_KEY
        )}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as {
            episodes?: Array<{
              episode_number: number;
              season_number: number;
              name?: string;
              air_date?: string;
              runtime?: number;
              still_path?: string | null;
              overview?: string;
            }>;
          };
          for (const ep of json.episodes || []) {
            putEp(ep.season_number || seasonNum, ep.episode_number, {
              title: ep.name || null,
              aired_at: ep.air_date || null,
              duration_min: ep.runtime ?? null,
              thumbnail: ep.still_path
                ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
                : null,
              overview: ep.overview || null,
            });
          }
        }
      } catch {
        // Fallback below
      }
    }
  }

  // Fill numbered placeholders up to total_episodes (or current_episode) for season 1
  // when external catalog doesn't return all episodes (e.g. ongoing anime or manual entries).
  const targetCount = Math.max(
    media.total_episodes || 0,
    media.current_episode || 0
  );
  if (map.size === 0 || (media.provider !== "tvmaze" && targetCount > 0 && targetCount <= 200)) {
    const fillCount = Math.min(Math.max(targetCount, map.size || 12), 200);
    const s = media.current_season || 1;
    for (let ep = 1; ep <= fillCount; ep++) {
      if (!map.has(`${s}:${ep}`) && (media.provider !== "tvmaze" || map.size === 0)) {
        putEp(s, ep, { title: `Episódio ${ep}` });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  );
}
