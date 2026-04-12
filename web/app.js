const repoListEl = document.getElementById("repo-list");
const repoMetaEl = document.getElementById("repo-meta");
const blogListEl = document.getElementById("blog-list");
const blogMetaEl = document.getElementById("blog-meta");

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未知";
  return d.toLocaleDateString("zh-CN");
}

function renderRepoCard(repo) {
  const card = document.createElement("article");
  card.className = "repo-card";
  card.innerHTML = `
    <h3><a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">${repo.name}</a></h3>
    <p>${repo.description || "暂无描述"}</p>
    <div class="repo-meta">
      <span>${repo.language || "Unknown"}</span>
      <span>Star ${repo.stargazers_count}</span>
    </div>
    <div class="repo-meta">
      <span>代码更新 ${fmtDate(repo.code_updated_at || repo.pushed_at)}</span>
      <span>Fork ${repo.forks_count}</span>
    </div>
  `;
  return card;
}

function renderBlogCard(post) {
  const card = document.createElement("article");
  card.className = "repo-card";
  card.innerHTML = `
    <h3>${post.title}</h3>
    <p>${post.excerpt || "暂无摘要"}</p>
    <div class="repo-meta">
      <span>发布 ${fmtDate(post.date)}</span>
      <span>${post.categories || "未分类"}</span>
    </div>
  `;
  return card;
}

async function loadRepos() {
  try {
    const resp = await fetch("/api/repos?limit=10");
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "加载仓库失败");
    }
    repoMetaEl.textContent = `数据来源: ${data.source} | 生成时间: ${fmtDate(data.generated_at)} | 共 ${data.items.length} 个项目`;
    repoListEl.innerHTML = "";
    data.items.forEach((repo) => repoListEl.appendChild(renderRepoCard(repo)));
  } catch (err) {
    repoMetaEl.textContent = `加载失败: ${err instanceof Error ? err.message : String(err)}`;
    repoListEl.innerHTML = "";
  }
}

async function loadBlogPosts() {
  if (!blogListEl || !blogMetaEl) {
    return;
  }
  try {
    const resp = await fetch("/api/blog-posts?limit=6");
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "加载博客失败");
    }
    blogMetaEl.textContent = `数据来源: ${data.source} | 生成时间: ${fmtDate(data.generated_at)} | 共 ${data.items.length} 篇`;
    blogListEl.innerHTML = "";
    data.items.forEach((post) => blogListEl.appendChild(renderBlogCard(post)));
  } catch (err) {
    blogMetaEl.textContent = `加载失败: ${err instanceof Error ? err.message : String(err)}`;
    blogListEl.innerHTML = "";
  }
}

loadRepos();
loadBlogPosts();
