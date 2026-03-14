const http = require("http");
const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");

const HOST = String(process.env.HOST || process.argv[2] || "0.0.0.0").trim() || "0.0.0.0";
const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const PUBLIC_ROOT = path.join(ROOT, "public");
const VIDEOS_ROOT = path.join(ROOT, "videos");
const CLEAN_ROUTES = {
  "/": "/index.html",
  "/home": "/index.html",
  "/drama": "/drama.html",
  "/movie": "/movie.html",
  "/latest": "/latest.html",
  "/category": "/category.html",
  "/search": "/search.html",
  "/history": "/history.html",
  "/watch": "/watch.html",
  "/information": "/information.html"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webp": "image/webp"
};

const ALLOWED_GENRES = [
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

function parseLikeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const cleaned = value.replace(/[^\d.]/g, "");
  const base = Number(cleaned);
  if (!Number.isFinite(base)) {
    return 0;
  }
  if (value.includes("만")) {
    return Math.round(base * 10000);
  }
  if (value.includes("천")) {
    return Math.round(base * 1000);
  }
  return Math.round(base);
}

function parseEpisodeCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value !== "string") {
    return 0;
  }
  const match = value.match(/\d+/);
  if (!match) {
    return 0;
  }
  return Math.max(1, Number.parseInt(match[0], 10));
}

function normalizeEpisodes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return { episode: index + 1, title: item };
      }
      if (item && typeof item === "object") {
        const episode = parseEpisodeCount(item.episode) || index + 1;
        const title = String(item.title || item.name || `${episode}화`);
        return {
          ...item,
          episode,
          title
        };
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeCast(value) {
  if (Array.isArray(value)) {
    return value.map((name) => String(name)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeGenre(value) {
  if (Array.isArray(value) && value.length > 0) {
    return normalizeGenre(value[0]);
  }
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "드라마 장르";
  }
  if (ALLOWED_GENRES.includes(raw)) {
    return raw;
  }

  const lower = raw.toLowerCase();
  if (lower.includes("romance") || raw.includes("로맨스")) return "로맨스";
  if (lower.includes("comedy") || raw.includes("코미디")) return "코미디";
  if (lower.includes("action") || raw.includes("액션")) return "액션";
  if (lower.includes("thriller") || raw.includes("스릴러") || raw.includes("미스터리"))
    return "스릴러";
  if (lower.includes("horror") || raw.includes("호러") || raw.includes("공포"))
    return "호러";
  if (lower.includes("fantasy") || raw.includes("판타지")) return "판타지";
  if (lower.includes("sf") || raw.includes("sci") || raw.includes("사이파이"))
    return "SF";
  if (lower.includes("crime") || raw.includes("범죄") || raw.includes("느와르"))
    return "범죄";
  if (raw.includes("다큐")) return "다큐멘터리";
  if (raw.includes("뮤지컬") || raw.includes("음악")) return "음악 / 뮤지컬";
  if (raw.includes("애니")) return "애니메이션";
  if (raw.includes("가족") || raw.includes("키즈") || raw.includes("어린이"))
    return "어린이 & 가족";
  if (raw.includes("스포츠")) return "스포츠 영화";
  if (raw.includes("고전")) return "고전";
  if (raw.includes("단편")) return "단편 영화";
  if (raw.includes("인디")) return "인디";
  return "드라마 장르";
}

function normalizeCategoryType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "other";
  if (
    raw.includes("drama") ||
    raw.includes("series") ||
    raw.includes("show") ||
    raw.includes("드라마")
  ) {
    return "drama";
  }
  if (
    raw.includes("movie") ||
    raw.includes("film") ||
    raw.includes("cinema") ||
    raw.includes("영화")
  ) {
    return "movie";
  }
  return "other";
}

function normalizeContentRating(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return 0;
  }
  if (raw.includes("전체") || raw === "all") {
    return 0;
  }
  if (raw.includes("청소년 관람불가") || raw.includes("restricted")) {
    return 19;
  }
  const match = raw.match(/\d+/);
  if (match) {
    return Number.parseInt(match[0], 10);
  }
  return 0;
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "y", "인기"].includes(value.toLowerCase());
  }
  return false;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function pick(metadata, keys) {
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null) {
      return metadata[key];
    }
  }
  return undefined;
}

async function readMetadata(folderName) {
  const folderPath = path.join(VIDEOS_ROOT, folderName);
  const videoDirPath = path.join(folderPath, "video");
  const metadataPath = path.join(folderPath, "metadata.json");
  const metadataExists = await fileExists(metadataPath);

  let metadata = {};
  if (metadataExists) {
    try {
      const text = await fs.readFile(metadataPath, "utf8");
      metadata = JSON.parse(text);
    } catch {
      metadata = {};
    }
  }

  const title = pick(metadata, ["title", "name", "제목"]) || folderName;
  // Prefer a single canonical key (`category`) and keep `type` only as legacy fallback.
  const baseCategoryRaw =
    pick(metadata, ["category", "카테고리"]) ?? pick(metadata, ["type"]) ?? "other";
  const baseCategory = normalizeCategoryType(baseCategoryRaw);
  const genre = normalizeGenre(pick(metadata, ["genre", "genres", "장르"]));
  const likesRaw = pick(metadata, ["likes", "likeCount", "좋아요"]);
  const likesNumber = parseLikeNumber(likesRaw);
  const isPopular = toBoolean(pick(metadata, ["isPopular", "popular", "인기"]));
  const publishedAt = pick(metadata, [
    "publishedAt",
    "createdAt",
    "releaseDate",
    "publicDate",
    "공개일",
    "등록일",
    "업로드일"
  ]);
  const cast = normalizeCast(pick(metadata, ["cast", "actors", "출연", "출연배우"]));
  const contentRating = normalizeContentRating(
    pick(metadata, ["contentRating", "ageRating", "rating", "시청등급"])
  );
  const episodes = normalizeEpisodes(
    pick(metadata, ["episodes", "episodeTitles", "회차", "회차제목"])
  );
  const declaredEpisodes = parseEpisodeCount(
    pick(metadata, ["totalEpisodes", "episodesCount", "몇부작", "총회차"])
  );
  let availableEpisodes = [];
  try {
    const videoFiles = await fs.readdir(videoDirPath);
    availableEpisodes = videoFiles
      .map((name) => {
        const match = String(name).match(/^(\d+)\.mp4$/i);
        return match ? Number.parseInt(match[1], 10) : null;
      })
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
  } catch {
    availableEpisodes = [];
  }

  const totalEpisodes =
    availableEpisodes.length || declaredEpisodes || Math.max(episodes.length, 1);
  const category =
    baseCategory !== "other"
      ? baseCategory
      : totalEpisodes === 1
        ? "movie"
        : "drama";

  const thumbFile =
    pick(metadata, ["thumbnail", "thumbnailFile", "poster", "썸네일"]) || "img.png";
  const metadataVideoFile = String(
    pick(metadata, ["videoFile", "video", "fileName", "영상파일"]) || ""
  ).trim();
  const normalizedMetadataVideoFile = path.basename(metadataVideoFile);
  const selectedEpisode =
    availableEpisodes[0] ||
    parseEpisodeCount(normalizedMetadataVideoFile) ||
    parseEpisodeCount(metadataVideoFile) ||
    1;
  const videoFile = `${selectedEpisode}.mp4`;

  return {
    folder: folderName,
    title,
    category,
    likes: likesRaw ?? likesNumber,
    likesNumber,
    isPopular,
    publishedAt,
    genre,
    totalEpisodes,
    cast,
    contentRating,
    episodes,
    availableEpisodes,
    thumbnail: `videos/${folderName}/${thumbFile}`,
    videoPath: `videos/${folderName}/video/${videoFile}`
  };
}

async function getVideoItems() {
  let entries = [];
  try {
    entries = await fs.readdir(VIDEOS_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const folders = entries.filter((item) => item.isDirectory()).map((item) => item.name);
  const items = await Promise.all(folders.map((folderName) => readMetadata(folderName)));
  return items;
}

async function serveApi(res) {
  const items = await getVideoItems();
  const body = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: items.length,
      items
    },
    null,
    2
  );
  res.writeHead(200, { "Content-Type": MIME_TYPES[".json"] });
  res.end(body);
}

async function serveStatic(reqPath, req, res) {
  let normalizedPath = CLEAN_ROUTES[reqPath] || reqPath;
  if (!normalizedPath.startsWith("/videos/")) {
    const maybeClean = `${normalizedPath}.html`;
    if (CLEAN_ROUTES[normalizedPath]) {
      normalizedPath = CLEAN_ROUTES[normalizedPath];
    } else if (await fileExists(path.join(PUBLIC_ROOT, maybeClean.replace(/^\/+/, "")))) {
      normalizedPath = maybeClean;
    }
  }

  const decoded = decodeURIComponent(normalizedPath);
  const staticRoot = decoded.startsWith("/videos/") ? ROOT : PUBLIC_ROOT;
  const safePath = decoded.replace(/^\/+/, "");
  const filePath = path.join(staticRoot, safePath);
  const relative = path.relative(staticRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (ext === ".mp4") {
      const range = req.headers.range;
      if (range) {
        const match = String(range).match(/bytes=(\d*)-(\d*)/);
        const start = match && match[1] ? Number.parseInt(match[1], 10) : 0;
        const end =
          match && match[2] ? Number.parseInt(match[2], 10) : Math.max(0, stat.size - 1);

        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= stat.size) {
          res.writeHead(416, {
            "Content-Range": `bytes */${stat.size}`
          });
          res.end();
          return;
        }

        res.writeHead(206, {
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": String(end - start + 1),
          "Cache-Control": "no-cache"
        });
        fsSync.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(stat.size),
        "Cache-Control": "no-cache"
      });
      fsSync.createReadStream(filePath).pipe(res);
      return;
    }

    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": String(stat.size)
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/api/videos") {
    await serveApi(res);
    return;
  }
  await serveStatic(url.pathname, req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`CrystalTV server is running at http://${HOST}:${PORT}`);
});
