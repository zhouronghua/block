"use strict";

const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const GITHUB_USER = process.env.GITHUB_USER || "zhouronghua";
const TOP_REPO_LIMIT = Number(process.env.TOP_REPO_LIMIT || 10);
const CACHE_MINUTES = Number(process.env.REPO_CACHE_MINUTES || 20);
const CACHE_MS = CACHE_MINUTES * 60 * 1000;
const CACHE_SCHEMA_VERSION = 2;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO_ENRICH_CONCURRENCY = Math.max(1, Number(process.env.REPO_ENRICH_CONCURRENCY || 3));
const BRANCH_SCAN_LIMIT = Math.max(1, Number(process.env.BRANCH_SCAN_LIMIT || 30));
const BRANCH_ENRICH_CONCURRENCY = Math.max(1, Number(process.env.BRANCH_ENRICH_CONCURRENCY || 4));

const cacheDir = path.resolve(process.cwd(), "build", "cache");
const cacheFile = path.join(cacheDir, "repos.json");
const blogPostDir = path.resolve(process.cwd(), "web", "content", "blog");

function isoNow() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toIsoOrEmpty(value) {
  const d = new Date(value || 0);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function githubHeaders() {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "zrh-asia-site"
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubFetchJson(url) {
  const resp = await fetch(url, { headers: githubHeaders() });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  if (workerCount === 0) {
    return [];
  }
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function fetchRepoBranches(fullName) {
  const branches = [];
  let page = 1;
  while (branches.length < BRANCH_SCAN_LIMIT) {
    const url = `https://api.github.com/repos/${fullName}/branches?per_page=100&page=${page}`;
    const chunk = await githubFetchJson(url);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }
    branches.push(...chunk);
    if (chunk.length < 100) {
      break;
    }
    page += 1;
  }
  return branches.slice(0, BRANCH_SCAN_LIMIT);
}

async function fetchCommitDate(commitUrl) {
  const commit = await githubFetchJson(commitUrl);
  const date =
    commit?.commit?.committer?.date ||
    commit?.commit?.author?.date ||
    "";
  return new Date(date || 0).getTime();
}

async function resolveLatestCodeUpdateAt(repo) {
  const fallbackTs = new Date(repo.pushed_at || repo.updated_at || 0).getTime();
  try {
    const branches = await fetchRepoBranches(repo.full_name);
    const branchDates = await mapWithConcurrency(
      branches,
      BRANCH_ENRICH_CONCURRENCY,
      async (branch) => {
        const commitUrl = branch?.commit?.url || "";
        if (!commitUrl) {
          return 0;
        }
        try {
          return await fetchCommitDate(commitUrl);
        } catch (error) {
          console.warn(`[${isoNow()}] commit date fallback for ${repo.full_name}:${branch.name}`, error);
          return 0;
        }
      }
    );
    const latestTs = Math.max(fallbackTs, ...branchDates);
    return toIsoOrEmpty(latestTs);
  } catch (error) {
    console.warn(`[${isoNow()}] branch scan fallback for ${repo.full_name}`, error);
    return toIsoOrEmpty(fallbackTs);
  }
}

function normalizeRepo(repo, codeUpdatedAt) {
  return {
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description || "",
    language: repo.language || "Unknown",
    stargazers_count: safeNumber(repo.stargazers_count),
    forks_count: safeNumber(repo.forks_count),
    pushed_at: repo.pushed_at,
    updated_at: repo.updated_at,
    code_updated_at: codeUpdatedAt || repo.pushed_at || repo.updated_at || ""
  };
}

async function readCache() {
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.generated_at) {
      return null;
    }
    if (safeNumber(parsed.schema_version) !== CACHE_SCHEMA_VERSION) {
      return null;
    }
    const age = Date.now() - new Date(parsed.generated_at).getTime();
    if (age > CACHE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(items) {
  await fs.mkdir(cacheDir, { recursive: true });
  const payload = {
    schema_version: CACHE_SCHEMA_VERSION,
    source_user: GITHUB_USER,
    generated_at: isoNow(),
    ttl_minutes: CACHE_MINUTES,
    items
  };
  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function fetchAllRepos() {
  const all = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/users/${encodeURIComponent(GITHUB_USER)}/repos?sort=updated&per_page=100&page=${page}`;
    const chunk = await githubFetchJson(url);
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }
    all.push(...chunk);
    if (chunk.length < 100) {
      break;
    }
    page += 1;
  }
  return all;
}

async function listTopRepos(limit = TOP_REPO_LIMIT) {
  const repos = await fetchAllRepos();
  const filtered = repos.filter((repo) => !repo.fork && !repo.archived);
  const enriched = await mapWithConcurrency(
    filtered,
    REPO_ENRICH_CONCURRENCY,
    async (repo) => normalizeRepo(repo, await resolveLatestCodeUpdateAt(repo))
  );
  return enriched
    .sort((a, b) => {
      const left = new Date(b.code_updated_at || b.pushed_at || 0).getTime();
      const right = new Date(a.code_updated_at || a.pushed_at || 0).getTime();
      return left - right || b.stargazers_count - a.stargazers_count;
    })
    .slice(0, limit);
}

function parseFrontMatter(raw) {
  const matched = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!matched) {
    return { metadata: {}, body: raw };
  }
  const [, frontMatter, body] = matched;
  const metadata = {};
  frontMatter.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx <= 0) {
      return;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    metadata[key] = value;
  });
  return { metadata, body };
}

function toExcerpt(markdown, maxLength = 160) {
  const plain = markdown
    .replace(/\{%\s*highlight[\s\S]*?%\}/g, " ")
    .replace(/\{%\s*endhighlight\s*%\}/g, " ")
    .replace(/\{%\s*[^%]+%\}/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}[^`]+`{1,3}/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength).trim()}...`;
}

async function listBlogPosts(limit = 6) {
  let entries = [];
  try {
    entries = await fs.readdir(blogPostDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries
    .filter((entry) => entry.isFile() && /\.(markdown|md)$/i.test(entry.name))
    .map((entry) => entry.name);
  const posts = await Promise.all(files.map(async (name) => {
    const fullPath = path.join(blogPostDir, name);
    const raw = await fs.readFile(fullPath, "utf8");
    const { metadata, body } = parseFrontMatter(raw);
    const dateText = metadata.date || name.slice(0, 10);
    const date = toIsoOrEmpty(dateText);
    const slug = name
      .replace(/\.(markdown|md)$/i, "")
      .replace(/^\d{4}-\d{2}-\d{1,2}-/, "");
    return {
      slug,
      title: metadata.title || slug,
      date,
      categories: metadata.categories || "",
      excerpt: toExcerpt(body)
    };
  }));
  return posts
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, Math.max(1, Math.min(30, limit)));
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "zrh-asia-api",
    now: isoNow()
  });
});

app.get("/api/repos", async (req, res) => {
  const limit = Math.max(1, Math.min(30, safeNumber(req.query.limit, TOP_REPO_LIMIT)));
  try {
    const useCache = String(req.query.fresh || "") !== "1";
    if (useCache) {
      const cached = await readCache();
      if (cached) {
        res.json({
          source: "cache",
          generated_at: cached.generated_at,
          items: cached.items.slice(0, limit)
        });
        return;
      }
    }

    const items = await listTopRepos(limit);
    const saved = await writeCache(items);
    res.json({
      source: "github",
      generated_at: saved.generated_at,
      items
    });
  } catch (error) {
    console.error(`[${isoNow()}] /api/repos failed`, error);
    const stale = await readCache();
    if (stale) {
      res.status(206).json({
        source: "stale-cache",
        generated_at: stale.generated_at,
        warning: "GitHub unavailable, served stale cache.",
        items: stale.items.slice(0, limit)
      });
      return;
    }

    res.status(502).json({
      error: "Failed to load repositories from GitHub.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/blog-posts", async (req, res) => {
  const limit = Math.max(1, Math.min(30, safeNumber(req.query.limit, 6)));
  try {
    const items = await listBlogPosts(limit);
    res.json({
      source: "local-blog-content",
      generated_at: isoNow(),
      items
    });
  } catch (error) {
    console.error(`[${isoNow()}] /api/blog-posts failed`, error);
    res.status(500).json({
      error: "Failed to load blog posts.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`[${isoNow()}] zrh-asia-api listening on ${PORT}`);
});
