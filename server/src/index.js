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

const cacheDir = path.resolve(process.cwd(), "build", "cache");
const cacheFile = path.join(cacheDir, "repos.json");

function isoNow() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function repoScore(repo) {
  const stars = safeNumber(repo.stargazers_count);
  const pushedAt = new Date(repo.pushed_at || 0).getTime();
  const daysSincePush = Math.max(0, (Date.now() - pushedAt) / (1000 * 60 * 60 * 24));
  const recency = Math.max(0, 120 - daysSincePush); // newer repos rank slightly higher
  return stars * 12 + recency;
}

function normalizeRepo(repo) {
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
    score: repoScore(repo)
  };
}

async function readCache() {
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.generated_at) {
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
    const resp = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "zrh-asia-site"
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GitHub API ${resp.status}: ${text}`);
    }
    const chunk = await resp.json();
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
  return repos
    .filter((repo) => !repo.fork && !repo.archived)
    .map(normalizeRepo)
    .sort((a, b) => b.score - a.score || b.stargazers_count - a.stargazers_count)
    .slice(0, limit);
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

app.listen(PORT, () => {
  console.log(`[${isoNow()}] zrh-asia-api listening on ${PORT}`);
});
