import {
  CatalogEpisode,
  MediaItem,
  MediaType,
  NextAiringInfo,
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

export function titleSimilarityScore(query: string, candidates: string[]): number {
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

interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

interface AniListRelationEdge {
  relationType: string | null;
  node: {
    id: number;
    idMal: number | null;
    type: string | null;
    format: string | null;
    episodes: number | null;
    status: string | null;
    startDate?: AniListDate | null;
    title?: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    } | null;
  } | null;
}

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
  startDate?: AniListDate | null;
  averageScore: number | null;
  genres: string[] | null;
  description: string | null;
  format: string | null;
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  } | null;
  airingSchedule?: {
    nodes?: Array<{
      episode: number;
      airingAt: number;
    }> | null;
  } | null;
  streamingEpisodes?: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
  }> | null;
  relations?: {
    edges?: AniListRelationEdge[] | null;
  } | null;
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
    next_airing: node.nextAiringEpisode
      ? {
          episode: node.nextAiringEpisode.episode,
          airing_at: new Date(
            node.nextAiringEpisode.airingAt * 1000
          ).toISOString(),
        }
      : null,
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
          nextAiringEpisode {
            episode
            airingAt
          }
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
        startDate {
          year
          month
          day
        }
        averageScore
        genres
        description(asHtml: false)
        nextAiringEpisode {
          episode
          airingAt
        }
        airingSchedule(perPage: 50) {
          nodes {
            episode
            airingAt
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
        }
        relations {
          edges {
            relationType
            node {
              id
              idMal
              type
              format
              episodes
              status
              startDate {
                year
                month
                day
              }
              title {
                romaji
                english
                native
              }
            }
          }
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

function aniStartDateSortKey(node: AniListMediaNode): number {
  const y = node.startDate?.year ?? node.seasonYear ?? 9999;
  const m = node.startDate?.month ?? 12;
  const d = node.startDate?.day ?? 31;
  return y * 10000 + m * 100 + d;
}

async function fetchAniListFranchiseChain(
  rootAniId: number | null,
  titleCandidates: string[],
  maxNodes = 10
): Promise<AniListMediaNode[]> {
  let seedId = rootAniId;
  if (!seedId) {
    for (const q of titleCandidates) {
      if (!q.trim()) continue;
      const hits = await searchAniList(q.trim(), 5);
      const best = hits.find(
        (h) =>
          h.media_type === "anime" &&
          titleSimilarityScore(q, [h.title, ...h.aliases]) >= 65
      );
      if (best) {
        const parsed = parseInt(best.external_id, 10);
        if (!Number.isNaN(parsed)) {
          seedId = parsed;
          break;
        }
      }
    }
  }
  if (!seedId) return [];

  const visited = new Map<number, AniListMediaNode>();
  const queued = new Set<number>([seedId]);
  let frontier: number[] = [seedId];

  while (frontier.length > 0 && visited.size < maxNodes) {
    const batch = frontier.slice(0, Math.min(frontier.length, maxNodes - visited.size));
    frontier = frontier.slice(batch.length);
    const fetched = await Promise.all(batch.map((id) => fetchAniListMediaById(id)));

    for (const node of fetched) {
      if (!node) continue;
      visited.set(node.id, node);

      for (const edge of node.relations?.edges || []) {
        const rel = edge.relationType;
        const target = edge.node;
        if (
          (rel === "PREQUEL" || rel === "SEQUEL") &&
          target &&
          target.type === "ANIME" &&
          (target.format === "TV" || target.format === "TV_SHORT") &&
          !queued.has(target.id) &&
          visited.size + frontier.length < maxNodes
        ) {
          queued.add(target.id);
          frontier.push(target.id);
        }
      }
    }
  }

  return Array.from(visited.values()).sort((a, b) => {
    const ka = aniStartDateSortKey(a);
    const kb = aniStartDateSortKey(b);
    return ka !== kb ? ka - kb : a.id - b.id;
  });
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
  maxPages = 4
): Promise<
  Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
    air_date: string | null;
  }>
> {
  const episodes: Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
    air_date: string | null;
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
          air_date: ep.aired || null,
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
// 2b. Kitsu API (cross-validation & episode metadata)
// ============================================================================

interface KitsuAnimeRecord {
  id: string;
  attributes: {
    canonicalTitle?: string;
    titles?: {
      en?: string;
      en_jp?: string;
      ja_jp?: string;
    };
    subtype?: string;
    status?: string;
    episodeCount?: number | null;
    startDate?: string | null;
  };
}

interface KitsuEpisodeRecord {
  id: string;
  attributes: {
    number?: number | null;
    seasonNumber?: number | null;
    canonicalTitle?: string | null;
    titles?: {
      en_us?: string;
      en_jp?: string;
    };
    synopsis?: string | null;
    airdate?: string | null;
    length?: number | null;
    thumbnail?: {
      original?: string;
    } | null;
  };
}

async function searchKitsuAnime(
  query: string,
  limit = 12
): Promise<KitsuAnimeRecord[]> {
  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(
      query
    )}&page[limit]=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: KitsuAnimeRecord[] };
    return json.data || [];
  } catch {
    return [];
  }
}

async function fetchKitsuEpisodes(
  kitsuId: string,
  maxPages = 3
): Promise<
  Array<{
    episode: number;
    title: string | null;
    aired_at: string | null;
    duration_min: number | null;
    thumbnail: string | null;
    overview: string | null;
  }>
> {
  const out: Array<{
    episode: number;
    title: string | null;
    aired_at: string | null;
    duration_min: number | null;
    thumbnail: string | null;
    overview: string | null;
  }> = [];

  for (let page = 0; page < maxPages; page++) {
    try {
      const offset = page * 20;
      const url = `https://kitsu.io/api/edge/anime/${encodeURIComponent(
        kitsuId
      )}/episodes?page[limit]=20&page[offset]=${offset}&sort=number`;
      const res = await fetch(url, {
        headers: { Accept: "application/vnd.api+json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: KitsuEpisodeRecord[];
        links?: { next?: string };
      };
      const items = json.data || [];
      for (const item of items) {
        const num = item.attributes.number;
        if (typeof num === "number" && num > 0) {
          out.push({
            episode: num,
            title:
              item.attributes.canonicalTitle ||
              item.attributes.titles?.en_us ||
              item.attributes.titles?.en_jp ||
              null,
            aired_at: item.attributes.airdate || null,
            duration_min: item.attributes.length ?? null,
            thumbnail: item.attributes.thumbnail?.original || null,
            overview: item.attributes.synopsis || null,
          });
        }
      }
      if (!json.links?.next || items.length < 20) break;
    } catch {
      break;
    }
  }

  return out;
}

async function fetchKitsuFranchiseCrossCheck(
  titleCandidates: string[]
): Promise<{
  totalEpisodes: number;
  tvEntries: KitsuAnimeRecord[];
  isReleasing: boolean;
}> {
  const primary = titleCandidates.find((t) => t.trim().length > 0)?.trim();
  if (!primary) return { totalEpisodes: 0, tvEntries: [], isReleasing: false };

  const records = await searchKitsuAnime(primary, 12);
  const seenIds = new Set<string>();
  const tvEntries = records
    .filter((rec) => {
      if (seenIds.has(rec.id)) return false;
      if (rec.attributes.subtype !== "TV") return false;
      const titles = [
        rec.attributes.canonicalTitle,
        rec.attributes.titles?.en,
        rec.attributes.titles?.en_jp,
      ].filter((v): v is string => Boolean(v && v.trim()));
      const bestSim = Math.max(
        ...titleCandidates.map((q) => titleSimilarityScore(q, titles)),
        0
      );
      if (bestSim < 70) return false;
      seenIds.add(rec.id);
      return true;
    })
    .sort((a, b) =>
      (a.attributes.startDate || "9999").localeCompare(
        b.attributes.startDate || "9999"
      )
    );

  const totalEpisodes = tvEntries.reduce(
    (sum, rec) => sum + (rec.attributes.episodeCount || 0),
    0
  );
  const isReleasing = tvEntries.some(
    (rec) => rec.attributes.status === "current"
  );
  return { totalEpisodes, tvEntries, isReleasing };
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
      airstamp?: string | null;
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
// 4. TMDB API (first-class for Series & Movies in pt-BR when configured)
// ============================================================================

const TMDB_GENRES: Record<number, string> = {
  10759: "Ação & Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  10762: "Infantil",
  9648: "Mistério",
  10763: "Notícias",
  10764: "Reality",
  10765: "Sci-Fi & Fantasia",
  10766: "Novela",
  10767: "Talk Show",
  10768: "Guerra & Política",
  37: "Faroeste",
  28: "Ação",
  12: "Aventura",
  14: "Fantasia",
  36: "História",
  27: "Terror",
  10402: "Música",
  10749: "Romance",
  878: "Ficção Científica",
  53: "Suspense",
  10752: "Guerra",
};

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
  genre_ids?: number[];
}

interface TMDBTVDetails {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  number_of_episodes?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  seasons?: Array<{ season_number: number; episode_count: number }>;
}

interface TMDBMovieDetails {
  id: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
}

function isTMDBConfigured(): boolean {
  return Boolean(
    process.env.TMDB_READ_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim()
  );
}

async function tmdbFetch<T>(pathWithQuery: string): Promise<T | null> {
  const token = process.env.TMDB_READ_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!token && !apiKey) return null;

  const sep = pathWithQuery.includes("?") ? "&" : "?";
  const url =
    token
      ? `https://api.themoviedb.org/3${pathWithQuery}`
      : `https://api.themoviedb.org/3${pathWithQuery}${sep}api_key=${encodeURIComponent(
          apiKey || ""
        )}`;

  try {
    const res = await fetch(url, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          }
        : { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function searchTMDB(
  query: string,
  limit = 6
): Promise<SearchResult[]> {
  if (!isTMDBConfigured()) return [];

  const json = await tmdbFetch<{ results?: TMDBMultiItem[] }>(
    `/search/multi?query=${encodeURIComponent(
      query
    )}&language=pt-BR&include_adult=false`
  );
  if (!json) return [];

  const filtered = (json.results || []).filter(
    (r) => r.media_type === "tv" || r.media_type === "movie"
  );

  return filtered.slice(0, limit).map((item) => {
    const title = item.name || item.title || "Sem Título";
    const orig = item.original_name || item.original_title || null;
    const dateStr = item.first_air_date || item.release_date || "";
    const genres = (item.genre_ids || [])
      .map((gid) => TMDB_GENRES[gid])
      .filter((g): g is string => Boolean(g));

    return {
      provider: "tmdb",
      external_id: `${item.media_type}:${item.id}`,
      mal_id: null,
      title,
      title_native: orig,
      aliases: Array.from(
        new Set([title, orig].filter((v): v is string => Boolean(v)))
      ),
      media_type: item.media_type === "movie" ? "movie" : "series",
      total_episodes: item.media_type === "movie" ? 1 : null,
      cover_image: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null,
      banner_image: item.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
        : null,
      synopsis: item.overview || null,
      genres,
      release_year: dateStr ? parseInt(dateStr.slice(0, 4), 10) : null,
      score:
        typeof item.vote_average === "number"
          ? Math.round(item.vote_average * 10) / 10
          : null,
    };
  });
}

export async function enrichTMDBResult(
  result: SearchResult
): Promise<SearchResult> {
  if (result.provider !== "tmdb" || !isTMDBConfigured()) return result;
  const [kind, tmdbId] = result.external_id.split(":");
  if (!tmdbId) return result;

  if (kind === "tv") {
    const details = await tmdbFetch<TMDBTVDetails>(
      `/tv/${tmdbId}?language=pt-BR`
    );
    if (!details) return result;
    return {
      ...result,
      title: details.name || result.title,
      aliases: Array.from(
        new Set(
          [...result.aliases, details.name, details.original_name].filter(
            (v): v is string => Boolean(v)
          )
        )
      ),
      total_episodes:
        typeof details.number_of_episodes === "number"
          ? details.number_of_episodes
          : result.total_episodes,
      synopsis: details.overview || result.synopsis,
      genres:
        details.genres && details.genres.length > 0
          ? details.genres.map((g) => g.name)
          : result.genres,
      status_airing: details.status || result.status_airing,
      cover_image: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : result.cover_image,
      banner_image: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
        : result.banner_image,
    };
  }

  if (kind === "movie") {
    const details = await tmdbFetch<TMDBMovieDetails>(
      `/movie/${tmdbId}?language=pt-BR`
    );
    if (!details) return result;
    return {
      ...result,
      title: details.title || result.title,
      aliases: Array.from(
        new Set(
          [...result.aliases, details.title, details.original_title].filter(
            (v): v is string => Boolean(v)
          )
        )
      ),
      total_episodes: 1,
      synopsis: details.overview || result.synopsis,
      genres:
        details.genres && details.genres.length > 0
          ? details.genres.map((g) => g.name)
          : result.genres,
      status_airing: details.status || result.status_airing,
    };
  }

  return result;
}

interface TMDBTVSeasonEpisode {
  episode_number: number;
  season_number: number;
  name?: string;
  air_date?: string;
  runtime?: number;
  still_path?: string | null;
  overview?: string;
}

interface TMDBMultiSeasonCatalog {
  tmdbId: number;
  status: string | null;
  totalEpisodes: number | null;
  seasons: Array<{
    seasonNumber: number;
    episodes: RawCatalogEpisode[];
  }>;
}

async function fetchTMDBSeasonsByShowId(
  tmdbId: string,
  minSeasonToInclude = 1
): Promise<TMDBMultiSeasonCatalog | null> {
  const details = await tmdbFetch<TMDBTVDetails>(
    `/tv/${tmdbId}?language=pt-BR`
  );
  if (!details) return null;

  const regularSeasons = (details.seasons || [])
    .map((s) => s.season_number)
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);

  const seasonsToFetch =
    regularSeasons.length > 0
      ? regularSeasons.slice(0, 15)
      : [Math.max(1, minSeasonToInclude)];
  if (
    minSeasonToInclude > 0 &&
    !seasonsToFetch.includes(minSeasonToInclude) &&
    minSeasonToInclude <= 15
  ) {
    seasonsToFetch.push(minSeasonToInclude);
    seasonsToFetch.sort((a, b) => a - b);
  }

  const seasonResponses = await Promise.all(
    seasonsToFetch.map((sNum) =>
      tmdbFetch<{ episodes?: TMDBTVSeasonEpisode[] }>(
        `/tv/${tmdbId}/season/${sNum}?language=pt-BR`
      )
    )
  );

  const seasons: Array<{ seasonNumber: number; episodes: RawCatalogEpisode[] }> =
    [];
  seasonResponses.forEach((sJson, idx) => {
    const sNum = seasonsToFetch[idx];
    const eps: RawCatalogEpisode[] = [];
    for (const ep of sJson?.episodes || []) {
      if (!Number.isFinite(ep.episode_number) || ep.episode_number <= 0) {
        continue;
      }
      const airDate = ep.air_date || null;
      eps.push({
        season: ep.season_number || sNum,
        episode: ep.episode_number,
        title: ep.name || null,
        aired_at: airDate,
        air_date: airDate,
        is_upcoming: computeIsUpcoming(airDate),
        duration_min: ep.runtime ?? null,
        thumbnail: ep.still_path
          ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
          : null,
        overview: ep.overview || null,
      });
    }
    if (eps.length > 0) {
      eps.sort((a, b) => a.episode - b.episode);
      seasons.push({ seasonNumber: sNum, episodes: eps });
    }
  });

  return {
    tmdbId: details.id,
    status: details.status || null,
    totalEpisodes:
      typeof details.number_of_episodes === "number"
        ? details.number_of_episodes
        : null,
    seasons,
  };
}

async function fetchTMDBShowMultiSeasonByTitles(
  titleCandidates: string[],
  isAnime: boolean,
  minSeasonToInclude = 1
): Promise<TMDBMultiSeasonCatalog | null> {
  if (!isTMDBConfigured()) return null;

  const queries = Array.from(
    new Set(titleCandidates.map((t) => t.trim()).filter(Boolean))
  ).slice(0, 2);
  if (queries.length === 0) return null;

  let bestItem: TMDBMultiItem | null = null;
  let bestScore = 0;

  for (const q of queries) {
    const json = await tmdbFetch<{ results?: TMDBMultiItem[] }>(
      `/search/tv?query=${encodeURIComponent(q)}&language=pt-BR&include_adult=false`
    );
    for (const hit of json?.results || []) {
      const names = [hit.name, hit.original_name].filter(
        (v): v is string => Boolean(v && v.trim())
      );
      let score = Math.max(
        ...queries.map((cand) => titleSimilarityScore(cand, names)),
        0
      );
      if (isAnime && hit.genre_ids?.includes(16)) {
        score += 6;
      }
      if (score > bestScore) {
        bestScore = score;
        bestItem = hit;
      }
    }
    if (bestScore >= 90) break;
  }

  if (!bestItem || bestScore < 65) return null;
  return fetchTMDBSeasonsByShowId(String(bestItem.id), minSeasonToInclude);
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
    const [tmdb, tvmaze] = await Promise.all([
      searchTMDB(cleanQ, 8),
      searchTVMaze(cleanQ, 6),
    ]);
    return [...tmdb, ...tvmaze];
  }

  const [anilist, tmdb, tvmaze] = await Promise.all([
    searchAniList(cleanQ, 6),
    searchTMDB(cleanQ, 6),
    searchTVMaze(cleanQ, 5),
  ]);

  let combined = [...anilist, ...tmdb, ...tvmaze];
  if (combined.length === 0) {
    combined = await searchJikan(cleanQ, 5);
  }

  return combined.sort((a, b) => {
    const sa = titleSimilarityScore(cleanQ, [a.title, ...a.aliases]);
    const sb = titleSimilarityScore(cleanQ, [b.title, ...b.aliases]);
    if (sb !== sa) return sb - sa;
    // Prefer TMDB/AniList over TVMaze on exact ties (pt-BR metadata + banners)
    const rank = (p: string) => (p === "tmdb" ? 3 : p === "anilist" ? 2 : 1);
    return rank(b.provider) - rank(a.provider);
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
  if (app === "youcine" && best.provider === "tmdb") bestScore += 4;

  for (const cand of candidates.slice(1)) {
    let s = titleSimilarityScore(cleanQ, [cand.title, ...cand.aliases]);
    if (app === "youcine" && cand.provider === "tmdb") s += 4;
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  const chosen = bestScore >= 25 ? best : candidates[0];

  if (chosen.provider === "tvmaze" && chosen.total_episodes === null) {
    const show = await fetchTVMazeShowWithEpisodes(chosen.external_id);
    if (show?._embedded?.episodes) {
      chosen.total_episodes = show._embedded.episodes.length;
    }
  } else if (chosen.provider === "tmdb") {
    return enrichTMDBResult(chosen);
  }

  return chosen;
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

export type RawCatalogEpisode = Omit<
  CatalogEpisode,
  "watched" | "watched_at" | "source_app" | "position_sec" | "duration_sec"
>;

export interface MediaCatalogAndAiring {
  episodes: RawCatalogEpisode[];
  next_airing: NextAiringInfo | null;
  airing_status: string | null;
  total_episodes: number | null;
}

function computeIsUpcoming(airDate?: string | null): boolean {
  if (!airDate) return false;
  const parsed = new Date(airDate);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
}

export async function fetchMediaCatalogAndAiring(
  media: Pick<
    MediaItem,
    | "provider"
    | "external_id"
    | "mal_id"
    | "media_type"
    | "total_episodes"
    | "current_season"
    | "current_episode"
  > & { title?: string; aliases?: string[] }
): Promise<MediaCatalogAndAiring> {
  const map = new Map<string, RawCatalogEpisode>();
  let nextAiring: NextAiringInfo | null = null;
  let airingStatus: string | null = null;
  let totalEpisodes: number | null = media.total_episodes ?? null;
  const isAnime =
    media.media_type === "anime" ||
    media.provider === "anilist" ||
    media.provider === "jikan";

  const putEp = (
    season: number,
    episode: number,
    patch: Partial<RawCatalogEpisode>
  ) => {
    if (!Number.isFinite(episode) || episode <= 0) return;
    const normalizedSeason = Math.max(1, Math.floor(season || 1));
    const normalizedEpisode = Math.floor(episode);
    const key = `${normalizedSeason}:${normalizedEpisode}`;
    const prev = map.get(key);
    const airDate = patch.air_date ?? prev?.air_date ?? null;
    const airedAt =
      patch.aired_at ??
      prev?.aired_at ??
      (airDate ? airDate.slice(0, 10) : null);
    map.set(key, {
      season: normalizedSeason,
      episode: normalizedEpisode,
      title: patch.title ?? prev?.title ?? null,
      aired_at: airedAt,
      air_date: airDate,
      is_upcoming:
        patch.is_upcoming !== undefined
          ? patch.is_upcoming
          : computeIsUpcoming(airDate),
      duration_min: patch.duration_min ?? prev?.duration_min ?? null,
      thumbnail: patch.thumbnail ?? prev?.thumbnail ?? null,
      overview: patch.overview ?? prev?.overview ?? null,
    });
  };

  if (isAnime && media.media_type !== "movie") {
    const titleCandidates = Array.from(
      new Set(
        [media.title, ...(media.aliases || [])]
          .map((t) => t?.trim())
          .filter((t): t is string => Boolean(t && t !== "Título Desconhecido"))
      )
    );

    const rootAniId =
      media.provider === "anilist" && media.external_id
        ? parseInt(media.external_id, 10) || null
        : null;
    const primaryMalId =
      media.mal_id ||
      (media.provider === "jikan" && media.external_id
        ? parseInt(media.external_id, 10) || null
        : null);
    const tmdbDirectId =
      media.provider === "tmdb" && media.external_id?.startsWith("tv:")
        ? media.external_id.split(":")[1]
        : null;

    // Cross-validate across AniList (full franchise chain), TMDB (pt-BR multi-season), Kitsu, and Jikan
    const [aniChain, tmdbCatalog, kitsuCheck, primaryJikanEps] =
      await Promise.all([
        fetchAniListFranchiseChain(rootAniId, titleCandidates, 10),
        tmdbDirectId
          ? fetchTMDBSeasonsByShowId(tmdbDirectId, media.current_season || 1)
          : fetchTMDBShowMultiSeasonByTitles(
              titleCandidates,
              true,
              media.current_season || 1
            ),
        fetchKitsuFranchiseCrossCheck(titleCandidates),
        primaryMalId ? fetchJikanEpisodes(primaryMalId, 4) : Promise.resolve([]),
      ]);

    // Filter to released/releasing/scheduled TV entries (ignore unscheduled NOT_YET_RELEASED teasers)
    const activeAniChain = aniChain.filter(
      (n) =>
        n.status !== "NOT_YET_RELEASED" ||
        Boolean(n.nextAiringEpisode) ||
        (n.airingSchedule?.nodes?.length || 0) > 0
    );

    // Build per-cour data from AniList franchise chain
    const courStats = activeAniChain.map((node) => {
      const schedMax = (node.airingSchedule?.nodes || []).reduce(
        (m, n) => Math.max(m, n.episode),
        0
      );
      const streamMax = node.streamingEpisodes?.length || 0;
      const nextEpNum = node.nextAiringEpisode?.episode || 0;
      const count =
        typeof node.episodes === "number" && node.episodes > 0
          ? node.episodes
          : Math.max(schedMax, streamMax, nextEpNum, node.status === "RELEASING" ? 12 : 0);
      return { node, count };
    });

    const aniTotal = courStats.reduce((sum, c) => sum + c.count, 0);
    const hasReleasingAni = activeAniChain.some(
      (n) => n.status === "RELEASING" || Boolean(n.nextAiringEpisode)
    );
    if (hasReleasingAni) {
      airingStatus = "RELEASING";
    } else if (activeAniChain.length > 0) {
      airingStatus = activeAniChain[activeAniChain.length - 1].status || null;
    } else if (kitsuCheck.isReleasing) {
      airingStatus = "RELEASING";
    } else if (tmdbCatalog?.status) {
      airingStatus = tmdbCatalog.status;
    }

    // Flatten AniList chain schedule/streaming metadata with cumulative offsets
    const aniFlatByAbs = new Map<number, Partial<RawCatalogEpisode>>();
    let runningOffset = 0;
    for (const { node, count } of courStats) {
      for (const sNode of node.airingSchedule?.nodes || []) {
        const absEp = runningOffset + sNode.episode;
        const iso = new Date(sNode.airingAt * 1000).toISOString();
        aniFlatByAbs.set(absEp, {
          ...(aniFlatByAbs.get(absEp) || {}),
          air_date: iso,
          aired_at: iso.slice(0, 10),
          is_upcoming: computeIsUpcoming(iso),
        });
      }
      if (node.nextAiringEpisode) {
        const absEp = runningOffset + node.nextAiringEpisode.episode;
        const iso = new Date(
          node.nextAiringEpisode.airingAt * 1000
        ).toISOString();
        if (!nextAiring) {
          nextAiring = { episode: absEp, airing_at: iso };
        }
        aniFlatByAbs.set(absEp, {
          ...(aniFlatByAbs.get(absEp) || {}),
          air_date: iso,
          aired_at: iso.slice(0, 10),
          is_upcoming: true,
        });
      }
      (node.streamingEpisodes || []).forEach((se, idx) => {
        const parsed = parseStreamingEpNumber(se.title);
        const absEp = runningOffset + (parsed.episode ?? idx + 1);
        const prev = aniFlatByAbs.get(absEp) || {};
        aniFlatByAbs.set(absEp, {
          ...prev,
          title: prev.title || parsed.cleanTitle || se.title || null,
          thumbnail: prev.thumbnail || se.thumbnail || null,
        });
      });
      runningOffset += count;
    }

    const tmdbFlatEps = tmdbCatalog
      ? tmdbCatalog.seasons.flatMap((s) => s.episodes)
      : [];

    if (tmdbCatalog && tmdbCatalog.seasons.length > 1) {
      // Strategy A: TMDB already provides true multi-season breakdown in pt-BR (e.g. Mushoku Tensei S1/S2/S3)
      let absCursor = 0;
      for (const s of tmdbCatalog.seasons) {
        for (const ep of s.episodes) {
          absCursor += 1;
          const aniExtra = aniFlatByAbs.get(absCursor);
          putEp(s.seasonNumber, ep.episode, {
            ...ep,
            title: ep.title || aniExtra?.title || null,
            air_date: ep.air_date || aniExtra?.air_date || null,
            aired_at: ep.aired_at || aniExtra?.aired_at || null,
            thumbnail: ep.thumbnail || aniExtra?.thumbnail || null,
          });
        }
      }
      // Only append a brand-new releasing cour strictly beyond TMDB (avoid 1-2 ep Special/Ep0 offset drift)
      if (hasReleasingAni && aniTotal - absCursor >= 4) {
        const nextSeason =
          tmdbCatalog.seasons[tmdbCatalog.seasons.length - 1].seasonNumber + 1;
        for (let abs = absCursor + 1; abs <= aniTotal; abs++) {
          const aniExtra = aniFlatByAbs.get(abs);
          putEp(nextSeason, abs - absCursor, {
            title: aniExtra?.title || `Episódio ${abs - absCursor}`,
            air_date: aniExtra?.air_date || null,
            aired_at: aniExtra?.aired_at || null,
            thumbnail: aniExtra?.thumbnail || null,
            is_upcoming: aniExtra?.is_upcoming,
          });
        }
      }
    } else if (
      tmdbCatalog &&
      tmdbCatalog.seasons.length === 1 &&
      courStats.length > 1
    ) {
      // Strategy B: TMDB has all eps in S1 (e.g. Jujutsu Kaisen S1:59), while AniList splits true TV seasons [24, 23, 12]
      let cursor = 0;
      courStats.forEach((cour, idx) => {
        const seasonNum = idx + 1;
        const isLast = idx === courStats.length - 1;
        const sliceCount = isLast
          ? Math.max(cour.count, tmdbFlatEps.length - cursor)
          : cour.count;
        for (let epNum = 1; epNum <= sliceCount; epNum++) {
          const absIdx = cursor + epNum;
          const tmdbEp = tmdbFlatEps[absIdx - 1];
          const aniExtra = aniFlatByAbs.get(absIdx);
          putEp(seasonNum, epNum, {
            title:
              tmdbEp?.title ||
              aniExtra?.title ||
              `Episódio ${epNum}`,
            air_date: aniExtra?.air_date || tmdbEp?.air_date || null,
            aired_at: aniExtra?.aired_at || tmdbEp?.aired_at || null,
            duration_min: tmdbEp?.duration_min ?? null,
            thumbnail: tmdbEp?.thumbnail || aniExtra?.thumbnail || null,
            overview: tmdbEp?.overview || null,
            is_upcoming:
              aniExtra?.is_upcoming ?? tmdbEp?.is_upcoming ?? false,
          });
        }
        cursor += sliceCount;
      });
    } else if (tmdbFlatEps.length > 0) {
      // Strategy C: Single-season anime with TMDB pt-BR + AniList + Jikan overlay
      tmdbFlatEps.forEach((ep, idx) => {
        const absIdx = idx + 1;
        const aniExtra = aniFlatByAbs.get(absIdx);
        const jikanEp = primaryJikanEps[idx];
        putEp(ep.season, ep.episode, {
          ...ep,
          title: ep.title || aniExtra?.title || jikanEp?.title || null,
          air_date: aniExtra?.air_date || ep.air_date || jikanEp?.air_date || null,
          aired_at: aniExtra?.aired_at || ep.aired_at || jikanEp?.aired_at || null,
          thumbnail: ep.thumbnail || aniExtra?.thumbnail || null,
        });
      });
    } else if (courStats.length > 0) {
      // Strategy D: No TMDB hit — build multi-season catalog from AniList chain + Jikan + Kitsu
      const jikanPerCour = await Promise.all(
        courStats.slice(0, 6).map(({ node }) => {
          if (node.idMal && node.idMal === primaryMalId && primaryJikanEps.length > 0) {
            return Promise.resolve(primaryJikanEps);
          }
          return node.idMal ? fetchJikanEpisodes(node.idMal, 3) : Promise.resolve([]);
        })
      );
      const kitsuEps =
        kitsuCheck.tvEntries[0]?.id && primaryJikanEps.length === 0
          ? await fetchKitsuEpisodes(kitsuCheck.tvEntries[0].id, 3)
          : [];

      let cursor = 0;
      courStats.forEach(({ count }, idx) => {
        const seasonNum = idx + 1;
        const jikanList = jikanPerCour[idx] || [];
        const epCount = Math.max(count, jikanList.length, 1);
        for (let epNum = 1; epNum <= epCount; epNum++) {
          const absIdx = cursor + epNum;
          const aniExtra = aniFlatByAbs.get(absIdx);
          const jEp = jikanList.find((j) => j.episode === epNum) || jikanList[epNum - 1];
          const kEp = idx === 0 ? kitsuEps.find((k) => k.episode === epNum) : undefined;
          putEp(seasonNum, epNum, {
            title:
              aniExtra?.title ||
              jEp?.title ||
              kEp?.title ||
              `Episódio ${epNum}`,
            air_date: aniExtra?.air_date || jEp?.air_date || kEp?.aired_at || null,
            aired_at: aniExtra?.aired_at || jEp?.aired_at || kEp?.aired_at || null,
            duration_min: kEp?.duration_min ?? null,
            thumbnail: aniExtra?.thumbnail || kEp?.thumbnail || null,
            overview: kEp?.overview || null,
            is_upcoming: aniExtra?.is_upcoming,
          });
        }
        cursor += epCount;
      });
    } else if (primaryJikanEps.length > 0) {
      for (const je of primaryJikanEps) {
        putEp(1, je.episode, {
          title: je.title,
          aired_at: je.aired_at,
          air_date: je.air_date,
        });
      }
    } else if (kitsuCheck.tvEntries[0]?.id) {
      const kEps = await fetchKitsuEpisodes(kitsuCheck.tvEntries[0].id, 4);
      for (const ke of kEps) {
        putEp(1, ke.episode, {
          title: ke.title,
          aired_at: ke.aired_at,
          air_date: ke.aired_at,
          duration_min: ke.duration_min,
          thumbnail: ke.thumbnail,
          overview: ke.overview,
        });
      }
    }

    const consensusTotal = Math.max(
      map.size,
      tmdbCatalog?.totalEpisodes || 0,
      aniTotal,
      kitsuCheck.totalEpisodes
    );
    if (consensusTotal > 0) {
      totalEpisodes = consensusTotal;
    }
  } else if (media.provider === "tvmaze" && media.external_id) {
    const show = await fetchTVMazeShowWithEpisodes(media.external_id);
    if (show) airingStatus = show.status || null;
    for (const ep of show?._embedded?.episodes || []) {
      if (typeof ep.number === "number" && ep.number > 0) {
        const airDate = ep.airstamp || ep.airdate || null;
        putEp(ep.season || 1, ep.number, {
          title: ep.name || null,
          aired_at: ep.airdate || null,
          air_date: airDate,
          duration_min: ep.runtime ?? null,
          thumbnail: ep.image?.medium || ep.image?.original || null,
          overview: stripHtml(ep.summary),
        });
      }
    }
  } else if (
    media.provider === "tmdb" &&
    media.external_id &&
    isTMDBConfigured()
  ) {
    const [kind, tmdbId] = media.external_id.split(":");
    if (kind === "movie" && tmdbId) {
      const movie = await tmdbFetch<TMDBMovieDetails>(
        `/movie/${tmdbId}?language=pt-BR`
      );
      airingStatus = movie?.status || null;
      putEp(1, 1, {
        title: movie?.title ? `${movie.title} (Filme Completo)` : "Filme Completo",
        thumbnail: movie?.backdrop_path
          ? `https://image.tmdb.org/t/p/w300${movie.backdrop_path}`
          : null,
        overview: movie?.overview || null,
      });
      totalEpisodes = 1;
    } else if (kind === "tv" && tmdbId) {
      const tmdbCatalog = await fetchTMDBSeasonsByShowId(
        tmdbId,
        media.current_season || 1
      );
      if (tmdbCatalog) {
        airingStatus = tmdbCatalog.status;
        if (typeof tmdbCatalog.totalEpisodes === "number") {
          totalEpisodes = tmdbCatalog.totalEpisodes;
        }
        for (const s of tmdbCatalog.seasons) {
          for (const ep of s.episodes) {
            putEp(s.seasonNumber, ep.episode, ep);
          }
        }
      }
    }
  }

  // Only fill placeholder season episodes if catalog is empty, respecting media.current_season
  if (map.size === 0) {
    const targetSeason = Math.max(1, media.current_season || 1);
    const fillCount = Math.min(
      Math.max(totalEpisodes || 0, media.current_episode || 0, 12),
      500
    );
    for (let ep = 1; ep <= fillCount; ep++) {
      putEp(targetSeason, ep, { title: `Episódio ${ep}` });
    }
  }

  // Ensure if current_season is strictly greater than max catalog season AND current_episode isn't already accounted for
  const maxCatalogSeason = Array.from(map.values()).reduce(
    (m, e) => Math.max(m, e.season),
    1
  );
  if (
    media.current_season > maxCatalogSeason &&
    media.current_episode > map.size
  ) {
    for (let s = maxCatalogSeason + 1; s <= media.current_season; s++) {
      const targetLen =
        s === media.current_season ? Math.max(12, media.current_episode) : 12;
      for (let ep = 1; ep <= Math.min(targetLen, 100); ep++) {
        putEp(s, ep, { title: `Episódio ${ep}` });
      }
    }
  }

  // Sort continuously by (season, episode) and assign abs_episode = 1..N
  const episodes = Array.from(map.values())
    .sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    )
    .map((ep, idx) => ({
      ...ep,
      abs_episode: idx + 1,
    }));

  // If next_airing wasn't set by AniList, derive from earliest upcoming catalog episode
  if (!nextAiring) {
    const nextUpcoming = episodes.find((e) => e.is_upcoming && e.air_date);
    if (nextUpcoming && nextUpcoming.air_date) {
      nextAiring = {
        episode: nextUpcoming.abs_episode ?? nextUpcoming.episode,
        airing_at: nextUpcoming.air_date,
      };
    }
  }

  if (episodes.some((e) => e.is_upcoming)) {
    airingStatus = "RELEASING";
  }

  if (
    airingStatus === "RELEASING" &&
    episodes.length > 0 &&
    episodes.length <= media.current_episode
  ) {
    totalEpisodes = null;
  } else if (episodes.length > 0) {
    totalEpisodes = episodes.length;
  }

  return {
    episodes,
    next_airing: nextAiring,
    airing_status: airingStatus,
    total_episodes: totalEpisodes,
  };
}

export async function fetchCatalogEpisodes(
  media: Pick<
    MediaItem,
    | "provider"
    | "external_id"
    | "mal_id"
    | "media_type"
    | "total_episodes"
    | "current_season"
    | "current_episode"
  > & { title?: string; aliases?: string[] }
): Promise<RawCatalogEpisode[]> {
  const { episodes } = await fetchMediaCatalogAndAiring(media);
  return episodes;
}
