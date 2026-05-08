"use strict";

(() => {
  const PROCESSED_ATTR = "data-commit-tags-processed";
  const BADGE_CLASS = "gct-badge";
  const SHA_RE = /^[0-9a-f]{7,40}$/i;
  const LOG = (...a) => console.log("[gh-commit-tags]", ...a);
  const WARN = (...a) => console.warn("[gh-commit-tags]", ...a);

  // Per-repo cache: `${owner}/${repo}` -> Map<shortSha, string[]>
  // The map's keys are short SHAs (whatever length GitHub's /tags page uses, normally 7).
  const tagMapCache = new Map();
  let observer = null;
  let scheduled = false;
  let lastBootedFor = null;

  function parseRepoFromUrl() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/commits(?:\/|$)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  }

  function findCommitRows() {
    // Try several selectors covering current and previous GitHub commit list layouts.
    const selectors = [
      '[data-testid="list-view-item"]',
      '[data-testid="commit-row-item"]',
      'li.js-commits-list-item',
      'li.Box-row',
      'div[role="listitem"]',
    ];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length) {
        LOG(`matched ${found.length} rows via selector "${sel}"`);
        return Array.from(found);
      }
    }

    // Generic fallback: find anchors that point to a commit and walk up to a sensible row.
    const anchors = Array.from(document.querySelectorAll('a[href*="/commit/"]')).filter((a) =>
      /\/commit\/[0-9a-f]{7,40}/i.test(a.getAttribute("href") || "")
    );
    const rows = new Set();
    for (const a of anchors) {
      // Walk up to the nearest list/article/row container.
      let el = a;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        if (
          el.tagName === "LI" ||
          el.tagName === "ARTICLE" ||
          el.getAttribute("role") === "listitem" ||
          (el.classList && (el.classList.contains("Box-row") || el.classList.contains("js-commits-list-item")))
        ) {
          rows.add(el);
          break;
        }
        el = el.parentElement;
      }
    }
    LOG(`fallback walk-up found ${rows.size} rows from ${anchors.length} commit anchors`);
    return Array.from(rows);
  }

  function extractSha(row) {
    const copyBtn = row.querySelector(
      'clipboard-copy[value], [data-clipboard-text], button[aria-label*="Copy" i][value]'
    );
    if (copyBtn) {
      const v = copyBtn.getAttribute("value") || copyBtn.getAttribute("data-clipboard-text");
      if (v && SHA_RE.test(v)) return v;
    }
    const link = row.querySelector('a[href*="/commit/"]');
    if (link) {
      const m = link.getAttribute("href").match(/\/commit\/([0-9a-f]{7,40})/i);
      if (m) return m[1];
    }
    return null;
  }

  function findInsertAnchor(row) {
    // Verified pill: GitHub's current commits UI uses a button class containing
    // "SignedCommitBadge" — insert immediately before it (so the tag pill sits on its left).
    const verified = row.querySelector('button[class*="SignedCommitBadge"]');
    if (verified) return { mode: "before", node: verified };

    // No Verified pill — find the right-side metadata container and prepend the
    // badge inside it so it lines up with where Verified would be.
    const metaContainer =
      row.querySelector('[class*="MetadataContainer-module__container"]') ||
      row.querySelector('[class*="Metadata-module__metadata"]');
    if (metaContainer) return { mode: "prepend", node: metaContainer };

    return null;
  }

  async function getTagMap(owner, repo) {
    const key = `${owner}/${repo}`;
    if (tagMapCache.has(key)) return tagMapCache.get(key);

    // Set the cached promise immediately so concurrent callers share one fetch.
    const promise = fetchTagMap(owner, repo).catch((e) => {
      WARN("getTagMap failed", e);
      return new Map();
    });
    tagMapCache.set(key, promise);
    return promise;
  }

  async function fetchTagMap(owner, repo) {
    const map = new Map(); // shortSha -> string[]

    // Single page is enough for typical repos. Could paginate via ?after=<cursor>
    // by following "Next" anchors if a project has hundreds of tags.
    const url = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`;
    const res = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } });
    if (!res.ok) {
      WARN(`/tags fetch ${res.status}`);
      return map;
    }
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Each tag entry has a primary tag-name link followed (in document order) by
    // a commit link before the next tag entry. Pair them by source order rather
    // than walking up the DOM, since the tag link and commit link may live in
    // sibling subtrees inside the same row container — DOM walk-up will overshoot
    // and grab the wrong commit link for entries past the first one.
    const tagLinks = Array.from(
      doc.querySelectorAll('a[href*="/releases/tag/"]')
    ).filter((a) => {
      const href = a.getAttribute("href") || "";
      // Skip "Release notes" links: they point at /releases/tag/<name>#... fragments.
      if (href.includes("#")) return false;
      // Skip the "Notes" link explicitly (text-only fallback).
      if ((a.textContent || "").trim().toLowerCase() === "notes") return false;
      return true;
    });
    const commitLinks = Array.from(doc.querySelectorAll('a[href*="/commit/"]'));
    LOG(`/tags page: ${tagLinks.length} tag links, ${commitLinks.length} commit links`);

    for (let i = 0; i < tagLinks.length; i++) {
      const tagLink = tagLinks[i];
      const nextTag = tagLinks[i + 1] || null;
      const name = (tagLink.textContent || "").trim();
      if (!name) continue;

      // Find the first commit link that lies AFTER tagLink and BEFORE nextTag.
      let pairedCommit = null;
      for (const cl of commitLinks) {
        const after = !!(tagLink.compareDocumentPosition(cl) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!after) continue;
        if (nextTag) {
          const beforeNext = !!(
            nextTag.compareDocumentPosition(cl) & Node.DOCUMENT_POSITION_PRECEDING
          );
          if (!beforeNext) continue;
        }
        pairedCommit = cl;
        break;
      }
      if (!pairedCommit) continue;

      const shaMatch = (pairedCommit.getAttribute("href") || "").match(
        /\/commit\/([0-9a-f]{7,40})/i
      );
      if (!shaMatch) continue;
      const shortSha = shaMatch[1].toLowerCase();

      const list = map.get(shortSha) || [];
      list.push(name);
      map.set(shortSha, list);
    }

    LOG(`built tag map with ${map.size} unique commits`);
    return map;
  }

  function lookupTagsForSha(tagMap, sha) {
    if (!tagMap || !sha) return [];
    const lower = sha.toLowerCase();
    // Direct full-length hit.
    const direct = tagMap.get(lower);
    if (direct && direct.length) return direct;
    // Bidirectional prefix match: the /tags page may yield 40-char SHAs while a
    // commit row only exposes a 7-char short SHA, or vice versa.
    for (const [key, tags] of tagMap) {
      if (key.startsWith(lower) || lower.startsWith(key)) return tags;
    }
    return [];
  }

  function renderBadge(row, tags) {
    if (!tags || tags.length === 0) return;
    if (row.querySelector(`.${BADGE_CLASS}`)) return;

    const anchor = findInsertAnchor(row);

    // Render one badge per tag, wrapped so they insert as a single block.
    const wrap = document.createElement("span");
    wrap.className = `${BADGE_CLASS}-wrap`;
    for (const name of tags) {
      const badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.textContent = name;
      badge.title = `Tag: ${name}`;
      wrap.appendChild(badge);
    }

    if (anchor && anchor.mode === "before" && anchor.node && anchor.node.parentElement) {
      anchor.node.parentElement.insertBefore(wrap, anchor.node);
    } else if (anchor && anchor.mode === "prepend" && anchor.node) {
      anchor.node.insertBefore(wrap, anchor.node.firstChild);
    } else {
      row.appendChild(wrap);
    }
  }

  async function processPage() {
    const repo = parseRepoFromUrl();
    if (!repo) {
      LOG("URL not a commits page; skipping");
      return;
    }
    if (lastBootedFor !== location.href) {
      LOG(`processing ${repo.owner}/${repo.repo} at ${location.href}`);
      lastBootedFor = location.href;
    }

    const allRows = findCommitRows();
    const rows = allRows.filter((r) => !r.hasAttribute(PROCESSED_ATTR));
    if (!rows.length) {
      if (!allRows.length) WARN("no commit rows found on page");
      return;
    }

    const tagMap = await getTagMap(repo.owner, repo.repo);

    let badged = 0;
    for (const row of rows) {
      const sha = extractSha(row);
      if (!sha) continue;
      row.setAttribute(PROCESSED_ATTR, "1");
      const tags = lookupTagsForSha(tagMap, sha);
      if (tags.length) {
        LOG(`${sha.slice(0, 7)} -> tags:`, tags);
        renderBadge(row, tags);
        badged++;
      }
    }
    LOG(`processed ${rows.length} rows, badged ${badged}`);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      processPage();
    }, 100);
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    LOG("init", location.href);
    schedule();
    setupObserver();
  }

  // Expose a manual trigger for debugging from DevTools (visible only inside the
  // content-script isolated world).
  window.__ghCommitTags = { processPage, fetchTagMap, lookupTagsForSha, findCommitRows };

  init();
  document.addEventListener("turbo:load", init);
  document.addEventListener("pjax:end", init);
})();
