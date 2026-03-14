const PAGE = document.body.dataset.page || "home";

const GENRE_ORDER = [
  "인디",
  "어린이 & 가족",
  "애니메이션",
  "액션",
  "코미디",
  "로맨스",
  "스릴러",
  "호러",
  "SF",
  "판타지",
  "드라마 장르",
  "범죄",
  "스포츠 영화",
  "다큐멘터리",
  "음악 / 뮤지컬",
  "고전",
  "단편 영화"
];

const HISTORY_COOKIE = "crystal_watch_history";
const NOW_COOKIE = "crystal_now_watching";
const HISTORY_LIMIT = 20;
const RUNTIME_CACHE_KEY = "crystal_runtime_cache";
const runtimeProbeFailedPaths = new Set();

const heartIcon = `
  <svg class="heart" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20.7 4.9 13.6a5 5 0 1 1 7.1-7.1l.7.7.7-.7a5 5 0 0 1 7.1 7.1z"
      fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

let allData = [];
let heroData = [];
let dramaData = [];
let movieData = [];
let latestData = [];

let heroPage = 0;
let heroPages = 1;
let cardsPerPage = 1;
let selectedCategoryGenre = "";
let isAppendingLoopBatch = false;
let nowWatchingPage = 0;
let nowWatchingPages = 1;
let nowWatchingPerPage = 1;

let watchSyncTick = 0;

const heroStrip = document.getElementById("hero-strip");
const indicators = document.getElementById("hero-indicators");
const dramaStrip = document.getElementById("drama-strip");
const movieStrip = document.getElementById("movie-strip");
const homeNowWatchingStrip = document.getElementById("home-now-watching-strip");
const homeCategoryList = document.getElementById("home-category-list");
const homeLoopFeed = document.getElementById("home-loop-feed");
const collectionStrip = document.getElementById("collection-strip");
const categorySidebarList = document.getElementById("category-sidebar-list");
const categoryPanel = document.getElementById("category-panel");
const searchInput = document.getElementById("search-input");
const searchSuggestList = document.getElementById("search-suggest-list");
const searchResultTitle = document.getElementById("search-result-title");
const searchResultStrip = document.getElementById("search-result-strip");
const nowWatchingStrip = document.getElementById("now-watching-strip");
const nowWatchingIndicators = document.getElementById("now-watching-indicators");
const historyStrip = document.getElementById("history-strip");

const watchTitle = document.getElementById("watch-title");
const watchEpisode = document.getElementById("watch-episode");
const watchVideo = document.getElementById("watch-video");
const watchInfoLink = document.getElementById("watch-info-link");

const infoPoster = document.getElementById("info-poster");
const infoWatchLink = document.getElementById("info-watch-link");
const infoTitle = document.getElementById("info-title");
const infoMeta = document.getElementById("info-meta");
const infoEpisodes = document.getElementById("info-episodes");
const infoBackBtn = document.getElementById("info-back-btn");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getFallbackPoster(title) {
  const safeTitle = escapeXml(title || "제목 없음");
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 510">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#1a1a1a"/>
          <stop offset="100%" stop-color="#080808"/>
        </linearGradient>
      </defs>
      <rect width="340" height="510" fill="url(#g)"/>
      <text x="50%" y="52%" text-anchor="middle" fill="#ffffff" font-size="20" font-family="sans-serif">${safeTitle}</text>
    </svg>
  `)
  );
}

function toVideoPath(folder, episode = 1) {
  return `videos/${folder}/video/${episode}.mp4`;
}

function getEpisodeFromItem(item) {
  const matched = String(item.videoPath || "").match(/\/(\d+)\.mp4$/);
  return matched ? Number.parseInt(matched[1], 10) : 1;
}

function toInformationUrl(item) {
  const folder = item.folder || "";
  const episode = getEpisodeFromItem(item);
  return `/information?folder=${encodeURIComponent(folder)}&episode=${episode}`;
}

function toPosterPath(item) {
  return item.thumbnail || `videos/${item.folder}/img.png`;
}

function formatClock(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatMinutesFromSeconds(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return "-";
  return `${Math.max(1, Math.round(sec / 60))}분`;
}

function getRuntimeCache() {
  try {
    const raw = localStorage.getItem(RUNTIME_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setRuntimeCache(cache) {
  try {
    localStorage.setItem(RUNTIME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage quota/read-only issues
  }
}

function getCachedRuntimeSeconds(videoPath) {
  const cache = getRuntimeCache();
  const value = Number(cache[videoPath] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function setCachedRuntimeSeconds(videoPath, seconds) {
  const value = Number(seconds || 0);
  if (!videoPath || !Number.isFinite(value) || value <= 0) return;
  const cache = getRuntimeCache();
  cache[videoPath] = Math.floor(value);
  setRuntimeCache(cache);
}

function probeVideoRuntime(videoPath) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      video.removeAttribute("src");
      video.load();
      resolve(Number(value || 0));
    };

    const timer = setTimeout(() => finish(0), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(video.duration || 0);
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(0);
    };
    video.src = videoPath;
  });
}

function formatRuntimeLabel(episodeMeta) {
  if (!episodeMeta || typeof episodeMeta !== "object") return "-";

  const sec = Number(
    episodeMeta.runtimeSeconds ??
      episodeMeta.durationSeconds ??
      episodeMeta.lengthSeconds ??
      0
  );
  if (Number.isFinite(sec) && sec > 0) {
    const mins = Math.max(1, Math.round(sec / 60));
    return `${mins}분`;
  }

  const mins = Number(
    episodeMeta.runtimeMinutes ??
      episodeMeta.durationMinutes ??
      episodeMeta.runtime ??
      episodeMeta.duration ??
      0
  );
  if (Number.isFinite(mins) && mins > 0) {
    return `${Math.max(1, Math.round(mins))}분`;
  }

  return "-";
}

function getEpisodeRuntimeSeconds(folder, episode, episodeMeta = null) {
  const secFromMeta = Number(
    episodeMeta?.runtimeSeconds ??
      episodeMeta?.durationSeconds ??
      episodeMeta?.lengthSeconds ??
      0
  );
  if (Number.isFinite(secFromMeta) && secFromMeta > 0) return secFromMeta;

  const minsFromMeta = Number(
    episodeMeta?.runtimeMinutes ??
      episodeMeta?.durationMinutes ??
      episodeMeta?.runtime ??
      episodeMeta?.duration ??
      0
  );
  if (Number.isFinite(minsFromMeta) && minsFromMeta > 0) return minsFromMeta * 60;

  const path = toVideoPath(folder, episode);
  const now = getNowWatching();
  if (now && now.videoPath === path) {
    const sec = Number(now.durationSeconds || 0);
    if (Number.isFinite(sec) && sec > 0) return sec;
  }

  const fromHistory = getWatchHistory().find((row) => row.videoPath === path);
  const secFromHistory = Number(fromHistory?.durationSeconds || 0);
  if (Number.isFinite(secFromHistory) && secFromHistory > 0) return secFromHistory;

  return getCachedRuntimeSeconds(path);
}

function getEpisodeWatchRecord(folder, episode) {
  const ep = Math.max(1, Number(episode || 1));
  const targetPath = toVideoPath(folder, ep);
  const now = getNowWatching();
  if (now && now.videoPath === targetPath) return now;
  return getWatchHistory().find((row) => row.videoPath === targetPath) || null;
}

function getEpisodeProgressInfo(folder, episode) {
  const record = getEpisodeWatchRecord(folder, episode);
  const watched = Number(record?.watchedSeconds || 0);
  const duration = Number(record?.durationSeconds || 0);
  const ratio =
    duration > 0 ? Math.max(0, Math.min(1, watched / duration)) : watched > 0 ? 0.02 : 0;
  const completed = duration > 0 && ratio >= 0.95;
  return { watched, duration, ratio, completed };
}

function createCard(item, withLikes = false) {
  const fallbackPoster = getFallbackPoster(item.title);
  const likes = withLikes
    ? `<div class="likes">${heartIcon}<span>${item.likes ?? "0"}</span></div>`
    : "";
  return `
    <article class="poster-card">
      <a class="poster-link" href="${toInformationUrl(item)}">
        <img class="poster-thumb" src="${toPosterPath(item)}" alt="${item.title}" loading="lazy" data-fallback="${fallbackPoster}" onerror="this.src=this.dataset.fallback" />
        <div class="poster-meta">
          <p class="poster-title">${item.title}</p>
          ${likes}
        </div>
      </a>
    </article>
  `;
}

function createHistoryCard(item) {
  const recordLikeItem = {
    ...item,
    likes: item.likes || "최근 시청"
  };
  const fallbackPoster = getFallbackPoster(recordLikeItem.title);
  const progressPercent = Math.round(
    Math.max(0, Math.min(1, Number(item.progressRatio || 0))) * 100
  );
  const totalEpisodes = Math.max(1, Number(item.totalEpisodes || 1));
  const episodeMeta =
    totalEpisodes > 1
      ? `<div class="watch-record-meta">회차: ${Number(item.episode || 1)} / ${totalEpisodes}</div>`
      : "";
  return `
    <article class="poster-card">
      <a class="poster-link" href="/information?folder=${encodeURIComponent(item.folder || "")}&episode=${Number(item.episode || 1)}">
        <img class="poster-thumb" src="${item.thumbnail || toPosterPath(recordLikeItem)}" alt="${item.title}" loading="lazy" data-fallback="${fallbackPoster}" onerror="this.src=this.dataset.fallback" />
        <div class="watch-progress-track" role="presentation">
          <span class="watch-progress-fill" style="width:${progressPercent}%"></span>
        </div>
        <div class="poster-meta">
          <p class="poster-title">${item.title}</p>
          ${episodeMeta}
        </div>
      </a>
    </article>
  `;
}

function toLikesLabel(value) {
  if (typeof value === "string" && value.trim()) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("ko-KR") : "0";
}

function toTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeCategory(raw, totalEpisodes = 0) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value.includes("drama") || value.includes("드라마") || value.includes("series")) return "drama";
  if (value.includes("movie") || value.includes("film") || value.includes("영화")) return "movie";
  if (Number(totalEpisodes) === 1) return "movie";
  return "drama";
}

function buildSections(items) {
  const normalized = items.map((item) => {
    const folder = item.folder;
    return {
      folder,
      title: item.title || folder,
      likes: toLikesLabel(item.likes),
      likesNumber: Number(item.likesNumber ?? item.likes ?? 0) || 0,
      category: normalizeCategory(item.category, item.totalEpisodes),
      genre: GENRE_ORDER.includes(item.genre) ? item.genre : "드라마 장르",
      totalEpisodes: Number(item.totalEpisodes || 1),
      availableEpisodes: Array.isArray(item.availableEpisodes)
        ? item.availableEpisodes
            .map((ep) => Number(ep))
            .filter((ep) => Number.isFinite(ep) && ep > 0)
            .sort((a, b) => a - b)
        : [],
      episodes: Array.isArray(item.episodes) ? item.episodes : [],
      cast: Array.isArray(item.cast) ? item.cast : [],
      contentRating: Number(item.contentRating || 0),
      isPopular: Boolean(item.isPopular),
      thumbnail: item.thumbnail || `videos/${folder}/img.png`,
      videoPath: item.videoPath || toVideoPath(folder, 1),
      publishedAt: toTimestamp(item.publishedAt)
    };
  });

  const popular = normalized
    .filter((item) => item.isPopular)
    .sort((a, b) => b.likesNumber - a.likesNumber);
  const hero = popular.length
    ? popular
    : [...normalized].sort((a, b) => b.likesNumber - a.likesNumber);
  const latest = [...normalized].sort((a, b) => b.publishedAt - a.publishedAt);
  const dramas = latest.filter((item) => item.category === "drama");
  const movies = latest.filter((item) => item.category === "movie");

  return {
    all: normalized,
    hero,
    latest,
    dramas: dramas.length ? dramas : latest,
    movies: movies.length ? movies : latest
  };
}

function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const key = `${name}=`;
  const found = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(key));
  if (!found) return "";
  return decodeURIComponent(found.slice(key.length));
}

function readStoredJson(key, fallback) {
  try {
    const fromLocal = window.localStorage.getItem(key);
    if (fromLocal) return JSON.parse(fromLocal);
  } catch {
    // Ignore localStorage read errors and fallback to cookie.
  }
  try {
    const fromCookie = getCookie(key);
    if (!fromCookie) return fallback;
    const parsed = JSON.parse(fromCookie);
    // Migrate legacy cookie data to localStorage when possible.
    try {
      window.localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // Ignore storage quota/access errors.
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  const serialized = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    // Fallback for restricted environments.
    setCookie(key, serialized);
    return;
  }
  // Keep cookie in sync for backward compatibility across older clients.
  setCookie(key, serialized);
}

function getWatchHistory() {
  const parsed = readStoredJson(HISTORY_COOKIE, []);
  return Array.isArray(parsed) ? parsed : [];
}

function getNowWatching() {
  const parsed = readStoredJson(NOW_COOKIE, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function saveWatchRecord(record) {
  if (!record || !record.videoPath) return;
  const prevNow = getNowWatching();
  const prevHistoryMatch = getWatchHistory().find((item) => item.videoPath === record.videoPath);
  const prev =
    prevNow && prevNow.videoPath === record.videoPath ? prevNow : prevHistoryMatch || null;

  // Keep maximum progress so a short revisit does not erase "completed" state.
  const watchedSeconds = Math.max(
    Number(record.watchedSeconds || 0),
    Number(prev?.watchedSeconds || 0)
  );
  const durationSeconds = Math.max(
    Number(record.durationSeconds || 0),
    Number(prev?.durationSeconds || 0)
  );

  const now = {
    ...prev,
    ...record,
    watchedSeconds,
    durationSeconds,
    watchedAt: Date.now()
  };

  const history = getWatchHistory().filter((item) => item.videoPath !== now.videoPath);
  history.unshift(now);
  writeStoredJson(HISTORY_COOKIE, history.slice(0, HISTORY_LIMIT));
  writeStoredJson(NOW_COOKIE, now);
}

function aggregateRecordsByContent(records) {
  const map = new Map();

  records.forEach((record) => {
    const folder = String(record?.folder || "").trim();
    if (!folder) return;

    const episode = Math.max(1, Number(record.episode || 1));
    const watchedAt = Number(record.watchedAt || 0);
    const watchedSeconds = Math.max(0, Number(record.watchedSeconds || 0));
    const durationSeconds = Math.max(0, Number(record.durationSeconds || 0));
    const ratio =
      durationSeconds > 0
        ? Math.max(0, Math.min(1, watchedSeconds / durationSeconds))
        : watchedSeconds > 0
          ? 0.02
          : 0;

    if (!map.has(folder)) {
      map.set(folder, {
        folder,
        title: record.title || folder,
        thumbnail: record.thumbnail || "",
        totalEpisodes: Math.max(1, Number(record.totalEpisodes || 1)),
        latestEpisode: episode,
        latestWatchedAt: watchedAt,
        episodes: new Map()
      });
    }

    const row = map.get(folder);
    row.title = row.title || record.title || folder;
    row.thumbnail = row.thumbnail || record.thumbnail || "";
    row.totalEpisodes = Math.max(row.totalEpisodes, Math.max(1, Number(record.totalEpisodes || 1)));
    if (watchedAt >= row.latestWatchedAt) {
      row.latestWatchedAt = watchedAt;
      row.latestEpisode = episode;
    }

    const prevEp = row.episodes.get(episode);
    if (!prevEp) {
      row.episodes.set(episode, { watchedSeconds, durationSeconds, ratio });
      return;
    }
    row.episodes.set(episode, {
      watchedSeconds: Math.max(prevEp.watchedSeconds, watchedSeconds),
      durationSeconds: Math.max(prevEp.durationSeconds, durationSeconds),
      ratio: Math.max(prevEp.ratio, ratio)
    });
  });

  return [...map.values()]
    .map((row) => {
      const contentMeta = allData.find((item) => item.folder === row.folder);
      const totalEpisodes = Math.max(
        row.totalEpisodes,
        Number(contentMeta?.totalEpisodes || 1),
        ...Array.from(row.episodes.keys(), (v) => Number(v || 0))
      );
      const ratioSum = Array.from({ length: totalEpisodes }, (_, i) => row.episodes.get(i + 1)?.ratio || 0)
        .reduce((sum, value) => sum + value, 0);
      const progressRatio = totalEpisodes > 0 ? Math.max(0, Math.min(1, ratioSum / totalEpisodes)) : 0;
      const completed = progressRatio >= 0.95;
      const latestEpProgress = row.episodes.get(row.latestEpisode) || {
        watchedSeconds: 0,
        durationSeconds: 0
      };

      return {
        folder: row.folder,
        title: row.title || contentMeta?.title || row.folder,
        thumbnail: row.thumbnail || contentMeta?.thumbnail || `videos/${row.folder}/img.png`,
        totalEpisodes,
        episode: row.latestEpisode,
        watchedSeconds: latestEpProgress.watchedSeconds,
        durationSeconds: latestEpProgress.durationSeconds,
        progressRatio: completed ? 1 : progressRatio,
        watchedAt: row.latestWatchedAt || 0
      };
    })
    .sort((a, b) => b.watchedAt - a.watchedAt);
}

function getNowWatchingBundles() {
  const now = getNowWatching();
  const history = getWatchHistory();
  const source = now ? [now, ...history] : history;
  return aggregateRecordsByContent(source);
}

function getHistoryBundles() {
  return aggregateRecordsByContent(getWatchHistory());
}

function getCategoryStats(items) {
  const map = new Map(
    GENRE_ORDER.map((genre, index) => [genre, { genre, index, score: 0, count: 0, items: [] }])
  );
  items.forEach((item) => {
    const key = GENRE_ORDER.includes(item.genre) ? item.genre : "드라마 장르";
    const row = map.get(key);
    row.count += 1;
    row.score += item.likesNumber || 0;
    row.items.push(item);
  });
  return [...map.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    return a.index - b.index;
  });
}

function renderSimpleStrip(target, items, withLikes = false) {
  if (!target) return;
  target.innerHTML = items.length
    ? items.map((item) => createCard(item, withLikes)).join("")
    : '<p class="empty-message">표시할 콘텐츠가 아직 없습니다.</p>';
}

function updateCardsPerPage() {
  if (!heroStrip) return;
  const wrapWidth = heroStrip.parentElement
    ? heroStrip.parentElement.clientWidth
    : window.innerWidth;
  const minCardWidth =
    window.innerWidth <= 760 ? 132 : window.innerWidth <= 1100 ? 145 : 160;
  const gap = window.innerWidth <= 760 ? 12 : 18;
  cardsPerPage = Math.max(1, Math.floor((wrapWidth + gap) / (minCardWidth + gap)));
}

function renderHeroIndicators() {
  if (!indicators) return;
  indicators.innerHTML = "";
  for (let i = 0; i < heroPages; i += 1) {
    const dot = document.createElement("span");
    dot.className = `dot ${i === heroPage ? "active" : ""}`;
    indicators.appendChild(dot);
  }
}

function updateHeroOffset() {
  if (!heroStrip) return;
  const firstCard = heroStrip.querySelector(".poster-card");
  if (!firstCard) return;
  const style = window.getComputedStyle(heroStrip);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
  const cardWidth = firstCard.getBoundingClientRect().width;
  heroStrip.style.transform = `translateX(-${heroPage * (cardWidth + gap) * cardsPerPage}px)`;
}

function renderHero() {
  if (!heroStrip) return;
  if (heroData.length === 0) {
    heroStrip.innerHTML = '<p class="empty-message">등록된 인기 영상이 아직 없습니다.</p>';
    if (indicators) indicators.innerHTML = "";
    return;
  }
  heroPages = Math.max(1, Math.ceil(heroData.length / cardsPerPage));
  heroPage = Math.min(heroPage, heroPages - 1);
  heroStrip.style.setProperty("--hero-cols", String(cardsPerPage));
  heroStrip.innerHTML = heroData.map((item) => createCard(item, true)).join("");
  updateHeroOffset();
  renderHeroIndicators();
}

function updateNowWatchingPerPage() {
  if (!nowWatchingStrip) return;
  const wrapWidth = nowWatchingStrip.parentElement
    ? nowWatchingStrip.parentElement.clientWidth
    : window.innerWidth;
  const minCardWidth =
    window.innerWidth <= 760 ? 132 : window.innerWidth <= 1100 ? 145 : 160;
  const gap = window.innerWidth <= 760 ? 12 : 18;
  nowWatchingPerPage = Math.max(1, Math.floor((wrapWidth + gap) / (minCardWidth + gap)));
}

function renderNowWatchingIndicators() {
  if (!nowWatchingIndicators) return;
  nowWatchingIndicators.innerHTML = "";
  for (let i = 0; i < nowWatchingPages; i += 1) {
    const dot = document.createElement("span");
    dot.className = `dot ${i === nowWatchingPage ? "active" : ""}`;
    nowWatchingIndicators.appendChild(dot);
  }
}

function renderNowWatchingSlider(items) {
  if (!nowWatchingStrip) return;
  if (!items.length) {
    nowWatchingStrip.innerHTML = '<p class="empty-message">지금 시청 중인 콘텐츠가 없습니다.</p>';
    if (nowWatchingIndicators) nowWatchingIndicators.innerHTML = "";
    return;
  }

  updateNowWatchingPerPage();
  nowWatchingPages = Math.max(1, Math.ceil(items.length / nowWatchingPerPage));
  nowWatchingPage = Math.min(nowWatchingPage, nowWatchingPages - 1);
  nowWatchingStrip.style.setProperty("--hero-cols", String(nowWatchingPerPage));
  nowWatchingStrip.innerHTML = items.map((item) => createHistoryCard(item)).join("");

  const firstCard = nowWatchingStrip.querySelector(".poster-card");
  if (firstCard) {
    const style = window.getComputedStyle(nowWatchingStrip);
    const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
    const cardWidth = firstCard.getBoundingClientRect().width;
    nowWatchingStrip.style.transform = `translateX(-${
      nowWatchingPage * (cardWidth + gap) * nowWatchingPerPage
    }px)`;
  }
  renderNowWatchingIndicators();
}

function createCategoryGroupSections(rows, maxCards = 5, showMoreLink = true) {
  return rows
    .map((row) => {
      const cards = [...row.items]
        .sort((a, b) => b.likesNumber - a.likesNumber)
        .slice(0, maxCards)
        .map((item) => createCard(item, true))
        .join("");
      return `
        <section class="category-block">
          <div class="section-head">
            <a href="/category?genre=${encodeURIComponent(row.genre)}" class="category-title-link">
              <h2>${row.genre}</h2>
            </a>
            ${
              showMoreLink
                ? `<a href="/category?genre=${encodeURIComponent(row.genre)}" class="more-link">전체보기 &#8250;</a>`
                : ""
            }
          </div>
          <div class="poster-strip small">${
            cards || '<p class="empty-message">등록된 콘텐츠가 아직 없습니다.</p>'
          }</div>
        </section>
      `;
    })
    .join("");
}

function renderHomeCategories() {
  if (!homeCategoryList) return;
  const rows = getCategoryStats(allData).filter((row) => row.count > 0);
  homeCategoryList.innerHTML = createCategoryGroupSections(rows, 5, true);
}

function buildLoopBatchHtml() {
  const topCategories = getCategoryStats(allData).filter((row) => row.count > 0).slice(0, 4);
  const nowItems = getNowWatchingBundles();
  return `
    <section class="content-section">
      <div class="section-head"><h2>인기 있는 영상</h2></div>
      <div class="poster-strip small home-row-strip">${heroData.map((item) => createCard(item, true)).join("")}</div>
    </section>
    <section class="content-section">
      <div class="section-head"><h2>지금 시청 중</h2></div>
      <div class="poster-strip small home-row-strip">${
        nowItems.length
          ? nowItems.map((item) => createHistoryCard(item)).join("")
          : '<p class="empty-message">지금 시청 중인 콘텐츠가 없습니다.</p>'
      }</div>
    </section>
    <section class="content-section">
      <div class="section-head"><h2>크리스탈TV에 새로 올라온 드라마</h2></div>
      <div class="poster-strip small home-row-strip">${dramaData.map((item) => createCard(item)).join("")}</div>
    </section>
    <section class="content-section">
      <div class="section-head"><h2>크리스탈TV에 새로 올라온 영화</h2></div>
      <div class="poster-strip small home-row-strip">${movieData.map((item) => createCard(item)).join("")}</div>
    </section>
    <section class="content-section">
      <div class="category-home-groups">${createCategoryGroupSections(topCategories, 5, true)}</div>
    </section>
  `;
}

function maybeAppendLoopBatch() {
  if (PAGE !== "home" || !homeLoopFeed || isAppendingLoopBatch || allData.length === 0) return;
  const scrollBottom = window.scrollY + window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  if (scrollBottom < docHeight - 220) return;
  isAppendingLoopBatch = true;
  const batch = document.createElement("div");
  batch.className = "loop-batch";
  batch.innerHTML = buildLoopBatchHtml();
  homeLoopFeed.appendChild(batch);
  isAppendingLoopBatch = false;
}

function renderCategoryPage() {
  if (!categorySidebarList || !categoryPanel) return;
  const rows = getCategoryStats(allData);
  const queryGenre = new URLSearchParams(window.location.search).get("genre") || "";
  selectedCategoryGenre =
    queryGenre && rows.some((row) => row.genre === queryGenre)
      ? queryGenre
      : selectedCategoryGenre && rows.some((row) => row.genre === selectedCategoryGenre)
        ? selectedCategoryGenre
        : rows[0]?.genre || "";

  categorySidebarList.innerHTML = rows
    .map(
      (row) => `
        <button type="button" class="category-side-item ${
          row.genre === selectedCategoryGenre ? "active" : ""
        }" data-genre="${row.genre}">
          ${row.genre}
        </button>
      `
    )
    .join("");

  categorySidebarList.querySelectorAll(".category-side-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategoryGenre = btn.dataset.genre;
      const params = new URLSearchParams(window.location.search);
      if (selectedCategoryGenre) params.set("genre", selectedCategoryGenre);
      else params.delete("genre");
      const nextUrl = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      window.history.replaceState(null, "", nextUrl);
      renderCategoryPage();
    });
  });

  const current = rows.find((row) => row.genre === selectedCategoryGenre);
  if (!current || current.count === 0) {
    categoryPanel.innerHTML = `
      <section class="category-block">
        <div class="section-head"><h2>${selectedCategoryGenre || "카테고리"}</h2></div>
        <p class="empty-message">이 장르에 등록된 콘텐츠가 아직 없습니다.</p>
      </section>
    `;
    return;
  }
  categoryPanel.innerHTML = createCategoryGroupSections([current], Number.MAX_SAFE_INTEGER, false);
}

function buildSearchTerms() {
  const terms = new Set();
  allData.forEach((item) => {
    terms.add(item.title);
    terms.add(item.genre);
  });
  return [...terms].filter(Boolean);
}

function searchItems(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [...latestData];
  return [...allData]
    .map((item) => {
      const title = item.title.toLowerCase();
      const genre = item.genre.toLowerCase();
      let score = 0;
      if (title.includes(q)) score += 6;
      if (genre.includes(q)) score += 4;
      if (title.startsWith(q)) score += 2;
      score += Math.min(2, item.likesNumber / 10000);
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item);
}

function renderSearchSuggestions(query) {
  if (!searchSuggestList) return;
  const q = query.trim().toLowerCase();
  const terms = buildSearchTerms();
  const list = (q ? terms.filter((term) => term.toLowerCase().includes(q)) : terms).slice(
    0,
    10
  );
  searchSuggestList.innerHTML = list.length
    ? list
        .map(
          (term) =>
            `<button type="button" class="search-suggest-item" data-term="${escapeXml(
              term
            )}">${term}</button>`
        )
        .join("")
    : '<p class="empty-message">연관 검색어가 없습니다.</p>';
  searchSuggestList.querySelectorAll(".search-suggest-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = btn.dataset.term || "";
      renderSearchPage(searchInput.value);
    });
  });
}

function renderSearchPage(query = "") {
  if (!searchResultStrip || !searchResultTitle) return;
  const results = searchItems(query);
  searchResultTitle.textContent = query ? `"${query}" 검색 결과` : "검색 결과";
  renderSimpleStrip(searchResultStrip, results, true);
  renderSearchSuggestions(query);
}

function renderWatchPage() {
  if (!watchVideo) return;
  const params = new URLSearchParams(window.location.search);
  const folder = params.get("folder") || "";
  const episode = Math.max(1, Number.parseInt(params.get("episode") || "1", 10) || 1);
  const item = allData.find((row) => row.folder === folder);

  if (!item) {
    if (watchTitle) watchTitle.textContent = "콘텐츠를 찾을 수 없습니다.";
    if (watchEpisode) watchEpisode.textContent = "";
    return;
  }

  const totalEpisodes = Math.max(1, Number(item.totalEpisodes || 1));
  const safeEpisode = Math.min(episode, totalEpisodes);
  const availableEpisodes =
    Array.isArray(item.availableEpisodes) && item.availableEpisodes.length
      ? item.availableEpisodes
      : Array.from({ length: totalEpisodes }, (_, i) => i + 1);
  const resolvedEpisode = availableEpisodes.includes(safeEpisode)
    ? safeEpisode
    : availableEpisodes[0];
  const src = toVideoPath(folder, resolvedEpisode);
  if (watchTitle) watchTitle.textContent = item.title;
  if (watchEpisode) {
    watchEpisode.textContent =
      totalEpisodes > 1
        ? `${resolvedEpisode}화 / 총 ${totalEpisodes}화`
        : `${resolvedEpisode}화`;
  }
  if (watchInfoLink) {
    watchInfoLink.href = `/information?folder=${encodeURIComponent(folder)}&episode=${resolvedEpisode}`;
  }
  watchVideo.src = src;

  const now = getNowWatching();
  if (
    now &&
    now.folder === folder &&
    Number(now.episode || 1) === resolvedEpisode &&
    Number(now.watchedSeconds || 0) > 1
  ) {
    watchVideo.addEventListener(
      "loadedmetadata",
      () => {
        watchVideo.currentTime = Math.min(Number(now.watchedSeconds || 0), watchVideo.duration || 0);
      },
      { once: true }
    );
  }

  const syncRecord = () => {
    const current = Number(watchVideo.currentTime || 0);
    const duration = Number(watchVideo.duration || 0);
    saveWatchRecord({
      folder,
      title: item.title,
      thumbnail: toPosterPath(item),
      genre: item.genre,
      episode: resolvedEpisode,
      totalEpisodes,
      watchedSeconds: current,
      durationSeconds: duration,
      videoPath: src
    });
  };

  watchVideo.addEventListener("timeupdate", () => {
    const tick = Math.floor(watchVideo.currentTime || 0);
    if (tick === watchSyncTick) return;
    watchSyncTick = tick;
    syncRecord();
  });
  watchVideo.addEventListener("pause", syncRecord);
  watchVideo.addEventListener("ended", syncRecord);
  watchVideo.addEventListener("loadedmetadata", syncRecord);
}

function renderInformationPage() {
  if (!infoTitle || !infoMeta || !infoEpisodes || !infoPoster || !infoWatchLink) return;
  const params = new URLSearchParams(window.location.search);
  const folder = params.get("folder") || "";
  const episode = Math.max(1, Number.parseInt(params.get("episode") || "1", 10) || 1);
  const item = allData.find((row) => row.folder === folder);

  if (!item) {
    infoTitle.textContent = "콘텐츠를 찾을 수 없습니다.";
    infoMeta.innerHTML = '<p class="empty-message">정보를 불러오지 못했습니다.</p>';
    infoEpisodes.innerHTML = "";
    return;
  }

  const totalEpisodes = Math.max(1, Number(item.totalEpisodes || 1));
  const safeEpisode = Math.min(episode, totalEpisodes);
  const episodeNumbers =
    Array.isArray(item.availableEpisodes) && item.availableEpisodes.length
      ? item.availableEpisodes
      : Array.from({ length: totalEpisodes }, (_, i) => i + 1);
  const episodeSection = infoEpisodes.closest(".category-block");
  const episodeSectionTitle = episodeSection?.querySelector(".section-head h2");
  if (episodeSection) episodeSection.style.display = "";

  infoTitle.textContent = item.title;
  infoPoster.src = toPosterPath(item);
  infoPoster.onerror = () => {
    infoPoster.src = getFallbackPoster(item.title);
  };
  infoWatchLink.href = `/watch?folder=${encodeURIComponent(folder)}&episode=${safeEpisode}`;

  const release = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString("ko-KR")
    : "-";
  const cast = item.cast && item.cast.length ? item.cast.join(", ") : "-";
  const rating = Number(item.contentRating || 0) === 0 ? "전체" : `${item.contentRating}세`;
  const totalRuntimeSeconds = episodeNumbers.reduce((sum, ep) => {
    const episodeMeta = item.episodes.find((row) => Number(row.episode) === ep) || {};
    return sum + getEpisodeRuntimeSeconds(folder, ep, episodeMeta);
  }, 0);
  const totalRuntimeLabel = totalRuntimeSeconds > 0 ? formatMinutesFromSeconds(totalRuntimeSeconds) : "-";

  infoMeta.innerHTML = `
    <p><strong>장르</strong>: ${item.genre}</p>
    <p><strong>공개일</strong>: ${release}</p>
    <p><strong>시청등급</strong>: ${rating}</p>
    <p><strong>전체 러닝타임</strong>: ${totalRuntimeLabel}</p>
    <p><strong>출연</strong>: ${cast}</p>
  `;

  if (totalEpisodes > 1) {
    if (episodeSectionTitle) episodeSectionTitle.textContent = "회차";
    infoEpisodes.innerHTML = episodeNumbers
      .map((ep) => {
        const episodeMeta = item.episodes.find((row) => Number(row.episode) === ep) || {};
        const title = episodeMeta.title || `${ep}`;
        const runtimeSeconds = getEpisodeRuntimeSeconds(folder, ep, episodeMeta);
        const runtime =
          runtimeSeconds > 0 ? formatMinutesFromSeconds(runtimeSeconds) : formatRuntimeLabel(episodeMeta);
        const progress = getEpisodeProgressInfo(folder, ep);
        const classes = [
          "info-episode-item",
          ep === safeEpisode ? "active" : "",
          progress.completed ? "completed" : "in-progress"
        ]
          .filter(Boolean)
          .join(" ");
        return `
          <a class="${classes}" style="--episode-progress:${Math.round(progress.ratio * 100)}%;" href="/watch?folder=${encodeURIComponent(folder)}&episode=${ep}">
            <span class="info-episode-no">${ep}</span>
            <span class="info-episode-title">${title}</span>
            <span class="info-episode-state">${runtime}</span>
          </a>
        `;
      })
      .join("");
  } else {
    if (episodeSectionTitle) episodeSectionTitle.textContent = "콘텐츠 정보";
    const movieEpisodeMeta = item.episodes.find((row) => Number(row.episode) === safeEpisode) || {};
    const movieRuntimeSeconds = getEpisodeRuntimeSeconds(folder, safeEpisode, movieEpisodeMeta);
    const movieRuntime =
      movieRuntimeSeconds > 0 ? formatMinutesFromSeconds(movieRuntimeSeconds) : formatRuntimeLabel(movieEpisodeMeta);
    const movieProgress = getEpisodeProgressInfo(folder, safeEpisode);
    const movieClasses = [
      "info-episode-item",
      "active",
      movieProgress.completed ? "completed" : "in-progress"
    ]
      .filter(Boolean)
      .join(" ");
    infoEpisodes.innerHTML = `
      <a class="${movieClasses}" style="--episode-progress:${Math.round(movieProgress.ratio * 100)}%;" href="/watch?folder=${encodeURIComponent(folder)}&episode=${safeEpisode}">
        <span class="info-episode-no">1</span>
        <span class="info-episode-title">본편</span>
        <span class="info-episode-state">${movieRuntime}</span>
      </a>
      <p class="info-movie-note">단일 편성 콘텐츠입니다. '시청하기' 또는 항목을 눌러 바로 감상할 수 있습니다.</p>
    `;
  }

  // Fill missing runtimes by probing real mp4 metadata, then rerender once.
  const pendingProbePaths = episodeNumbers
    .map((ep) => toVideoPath(folder, ep))
    .filter((path) => getCachedRuntimeSeconds(path) <= 0 && !runtimeProbeFailedPaths.has(path));

  if (!pendingProbePaths.length) return;
  Promise.all(
    pendingProbePaths.map(async (path) => {
      const probed = await probeVideoRuntime(path);
      if (probed > 0) {
        setCachedRuntimeSeconds(path, probed);
        return true;
      }
      runtimeProbeFailedPaths.add(path);
      return false;
    })
  ).then((results) => {
    if (!results.some(Boolean)) return;
    const current = new URLSearchParams(window.location.search);
    if ((current.get("folder") || "") !== folder) return;
    renderInformationPage();
  });
}

function wireHeroControls() {
  const prev = document.getElementById("hero-prev");
  const next = document.getElementById("hero-next");
  if (!prev || !next || !heroStrip) return;
  prev.addEventListener("click", () => {
    heroPage = (heroPage - 1 + heroPages) % heroPages;
    renderHero();
  });
  next.addEventListener("click", () => {
    heroPage = (heroPage + 1) % heroPages;
    renderHero();
  });
}

function wireNowWatchingControls() {
  const prev = document.getElementById("now-prev");
  const next = document.getElementById("now-next");
  if (!prev || !next || !nowWatchingStrip) return;

  const rerender = () => {
    const nowItems = getNowWatchingBundles();
    renderNowWatchingSlider(nowItems);
  };

  prev.addEventListener("click", () => {
    nowWatchingPage = (nowWatchingPage - 1 + nowWatchingPages) % nowWatchingPages;
    rerender();
  });
  next.addEventListener("click", () => {
    nowWatchingPage = (nowWatchingPage + 1) % nowWatchingPages;
    rerender();
  });
}

function renderByPage() {
  if (PAGE === "home") {
    updateCardsPerPage();
    renderHero();
    const nowItems = getNowWatchingBundles();
    if (homeNowWatchingStrip) {
      homeNowWatchingStrip.innerHTML = nowItems.length
        ? nowItems.map((item) => createHistoryCard(item)).join("")
        : '<p class="empty-message">지금 시청 중인 콘텐츠가 없습니다.</p>';
    }
    renderSimpleStrip(dramaStrip, dramaData, false);
    renderSimpleStrip(movieStrip, movieData, false);
    renderHomeCategories();
    if (homeLoopFeed) homeLoopFeed.innerHTML = "";
    maybeAppendLoopBatch();
    return;
  }
  if (PAGE === "drama") return renderSimpleStrip(collectionStrip, dramaData, true);
  if (PAGE === "movie") return renderSimpleStrip(collectionStrip, movieData, true);
  if (PAGE === "latest") return renderSimpleStrip(collectionStrip, latestData, true);
  if (PAGE === "category") return renderCategoryPage();
  if (PAGE === "search") return renderSearchPage(searchInput ? searchInput.value : "");
  if (PAGE === "watch") return renderWatchPage();
  if (PAGE === "information") return renderInformationPage();
  if (PAGE === "history") {
    const nowItems = getNowWatchingBundles();
    const historyItems = getHistoryBundles();
    renderNowWatchingSlider(nowItems);
    if (historyStrip) {
      historyStrip.innerHTML = historyItems.length
        ? historyItems.map((item) => createHistoryCard(item)).join("")
        : '<p class="empty-message">시청 기록이 아직 없습니다.</p>';
    }
  }
}

async function load() {
  try {
    const response = await fetch("/api/videos");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload.items;
    if (!Array.isArray(items)) throw new Error("Invalid payload shape");
    const sections = buildSections(items);
    allData = sections.all;
    heroData = sections.hero;
    latestData = sections.latest;
    dramaData = sections.dramas;
    movieData = sections.movies;
    renderByPage();
  } catch (error) {
    console.warn("동적 메타데이터 로딩 실패", error);
    renderByPage();
  }
}

document.querySelectorAll('.icon-btn[aria-label="검색"]').forEach((btn) => {
  btn.addEventListener("click", () => {
    window.location.href = "/search";
  });
});
document.querySelectorAll('.icon-btn[aria-label="시청 기록"]').forEach((btn) => {
  btn.addEventListener("click", () => {
    window.location.href = "/history";
  });
});

if (infoBackBtn) {
  infoBackBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/";
  });
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderSearchPage(searchInput.value);
  });
}

wireHeroControls();
wireNowWatchingControls();

window.addEventListener("resize", () => {
  if (PAGE === "home") {
    const prev = cardsPerPage;
    updateCardsPerPage();
    if (prev !== cardsPerPage) heroPage = 0;
    renderHero();
  }
  if (PAGE === "history") {
    const nowItems = getNowWatchingBundles();
    renderNowWatchingSlider(nowItems);
  }
});

window.addEventListener("scroll", maybeAppendLoopBatch, { passive: true });

load();
