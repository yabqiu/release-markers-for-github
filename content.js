"use strict";

(() => {
  const PROCESSED_ATTR = "data-commit-tags-processed";
  const BADGE_CLASS = "gct-badge";
  const SHA_RE = /^[0-9a-f]{7,40}$/i;
  const LOG = () => {};
  const WARN = (...a) => console.warn("[gh-commit-tags]", ...a);

  // Per-repo cache: `${owner}/${repo}` -> Map<shortSha, string[]>
  // The map's keys are short SHAs (whatever length GitHub's /tags page uses, normally 7).
  const tagMapCache = new Map();
  let observer = null;
  let scheduled = false;
  let lastBootedFor = null;

  function parseRepoFromUrl() {
    const list = location.pathname.match(
      /^\/([^/]+)\/([^/]+)\/commits(?:\/|$)/,
    );
    if (list) return { kind: "list", owner: list[1], repo: list[2] };
    const detail = location.pathname.match(
      /^\/([^/]+)\/([^/]+)\/commit\/([0-9a-f]{7,40})/i,
    );
    if (detail)
      return {
        kind: "detail",
        owner: detail[1],
        repo: detail[2],
        sha: detail[3],
      };
    return null;
  }

  function findCommitRows() {
    // Try several selectors covering current and previous GitHub commit list layouts.
    const selectors = [
      '[data-testid="list-view-item"]',
      '[data-testid="commit-row-item"]',
      "li.js-commits-list-item",
      "li.Box-row",
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
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/commit/"]'),
    ).filter((a) =>
      /\/commit\/[0-9a-f]{7,40}/i.test(a.getAttribute("href") || ""),
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
          (el.classList &&
            (el.classList.contains("Box-row") ||
              el.classList.contains("js-commits-list-item")))
        ) {
          rows.add(el);
          break;
        }
        el = el.parentElement;
      }
    }
    LOG(
      `fallback walk-up found ${rows.size} rows from ${anchors.length} commit anchors`,
    );
    return Array.from(rows);
  }

  function extractSha(row) {
    const copyBtn = row.querySelector(
      'clipboard-copy[value], [data-clipboard-text], button[aria-label*="Copy" i][value]',
    );
    if (copyBtn) {
      const v =
        copyBtn.getAttribute("value") ||
        copyBtn.getAttribute("data-clipboard-text");
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

    // Walk every page of /owner/repo/tags via the "Next" cursor link so a tag
    // that's older than the first page (~10 entries on modern GitHub) still
    // ends up in the map.
    const MAX_PAGES = 30;
    let url = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags`;
    let pageNum = 0;
    while (url && pageNum < MAX_PAGES) {
      pageNum++;
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (!res.ok) {
        WARN(`/tags page ${pageNum} fetch ${res.status}`);
        break;
      }
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      parseTagsPage(doc, map, pageNum);
      url = findNextTagsUrl(doc);
    }

    LOG(
      `built tag map with ${map.size} unique commits across ${pageNum} page(s)`,
    );
    return map;
  }

  function parseTagsPage(doc, map, pageNum) {
    // Build the canonical list of tag links: one per unique tag href, first
    // wins. GitHub's /tags page renders extra links to the same tag (the "…"
    // menu, "View tag" items, etc.); if those slip into our list as empty- or
    // dup-text entries they fragment the pairing window and a tag like 1.10.2
    // ends up with no commit in its range.
    const seenTagHrefs = new Set();
    const tagLinks = [];
    for (const a of doc.querySelectorAll('a[href*="/releases/tag/"]')) {
      const href = a.getAttribute("href") || "";
      // Skip release-notes anchors (they carry a #fragment).
      if (href.includes("#")) continue;
      const tagPath = (href.match(/\/releases\/tag\/([^/?#]+)/) || [])[1];
      if (!tagPath) continue;
      if (seenTagHrefs.has(tagPath)) continue;
      const text = (a.textContent || "").trim();
      if (!text) continue;
      if (text.toLowerCase() === "notes") continue;
      seenTagHrefs.add(tagPath);
      tagLinks.push(a);
    }

    const SHA_TEXT_RE = /^[0-9a-f]{7,40}$/i;
    LOG(`/tags page ${pageNum}: ${tagLinks.length} tag links (deduped)`);

    for (let i = 0; i < tagLinks.length; i++) {
      const tagLink = tagLinks[i];
      const name = (tagLink.textContent || "").trim();
      if (!name) continue;

      // Find this tag's entry container: walk up from the tag link until the
      // current ancestor would also enclose a different tag's link. The last
      // ancestor before that boundary is the row that belongs only to this
      // tag, so any SHA chip inside it is unambiguously this tag's commit.
      let entry = null;
      let el = tagLink.parentElement;
      for (let depth = 0; depth < 12 && el; depth++) {
        let enclosesOther = false;
        for (const other of tagLinks) {
          if (other === tagLink) continue;
          if (el.contains(other)) {
            enclosesOther = true;
            break;
          }
        }
        if (enclosesOther) break;
        entry = el;
        el = el.parentElement;
      }
      if (!entry) {
        WARN(`tag "${name}" has no entry container`);
        continue;
      }

      // Find the entry's commit-SHA chip. The /tags page renders it as an
      // <a> inside `<li class="text-mono">` in the metadata row, with href
      // /commit/<full-sha> and visible short-SHA text. Targeting that
      // structure directly skips:
      //   - inline /commit/<sha> references in `.commit-desc` release notes
      //   - the GPG key id (16-char hex) inside the Verified signature dialog
      //   - any other stray /commit/ anchors elsewhere in the entry
      let shaEl = null;
      const candidates = entry.querySelectorAll(
        'li.text-mono a[href*="/commit/"], li[class*="text-mono"] a[href*="/commit/"]'
      );
      for (const cand of candidates) {
        const href = cand.getAttribute("href") || "";
        const m = href.match(/\/commit\/([0-9a-f]{7,40})/i);
        if (!m) continue;
        const text = (cand.textContent || "").trim();
        if (!SHA_TEXT_RE.test(text)) continue;
        const hrefSha = m[1].toLowerCase();
        if (!hrefSha.startsWith(text.toLowerCase())) continue;
        shaEl = cand;
        break;
      }
      if (!shaEl) {
        WARN(`tag "${name}" has no SHA chip in its entry container`);
        continue;
      }

      const shortSha = (shaEl.textContent || "").trim().toLowerCase();
      if (!SHA_TEXT_RE.test(shortSha)) continue;
      LOG(`tag "${name}" -> ${shortSha}`);

      const list = map.get(shortSha) || [];
      list.push(name);
      map.set(shortSha, list);
    }
  }

  function findNextTagsUrl(doc) {
    // Modern GitHub uses <a rel="next" href="...?after=<cursor>">Next</a>.
    const relNext = doc.querySelector('a[rel="next"]');
    if (relNext) return relNext.getAttribute("href");
    // Fallback: any anchor whose visible text is "Next" and whose href carries
    // a pagination cursor.
    const anchors = Array.from(doc.querySelectorAll('a[href*="after="]'));
    for (const a of anchors) {
      if ((a.textContent || "").trim().toLowerCase() === "next") {
        return a.getAttribute("href");
      }
    }
    return null;
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

    if (
      anchor &&
      anchor.mode === "before" &&
      anchor.node &&
      anchor.node.parentElement
    ) {
      anchor.node.parentElement.insertBefore(wrap, anchor.node);
    } else if (anchor && anchor.mode === "prepend" && anchor.node) {
      anchor.node.insertBefore(wrap, anchor.node.firstChild);
    } else {
      row.appendChild(wrap);
    }
  }

  async function processPage() {
    const ctx = parseRepoFromUrl();
    if (!ctx) {
      LOG("URL not a commits/commit page; skipping");
      return;
    }
    if (lastBootedFor !== location.href) {
      LOG(
        `processing ${ctx.kind} ${ctx.owner}/${ctx.repo} at ${location.href}`,
      );
      lastBootedFor = location.href;
    }

    if (ctx.kind === "list") return processCommitListPage(ctx);
    if (ctx.kind === "detail") return processCommitDetailPage(ctx);
  }

  async function processCommitListPage(ctx) {
    const allRows = findCommitRows();
    const rows = allRows.filter((r) => !r.hasAttribute(PROCESSED_ATTR));
    if (!rows.length) {
      if (!allRows.length) WARN("no commit rows found on page");
      return;
    }

    const tagMap = await getTagMap(ctx.owner, ctx.repo);

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

  async function processCommitDetailPage(ctx) {
    if (document.querySelector(`.${BADGE_CLASS}-wrap--detail`)) return;

    const tagMap = await getTagMap(ctx.owner, ctx.repo);
    const tags = lookupTagsForSha(tagMap, ctx.sha);
    if (!tags.length) {
      LOG(`commit ${ctx.sha.slice(0, 7)} has no tags`);
      return;
    }
    LOG(`commit detail ${ctx.sha.slice(0, 7)} -> tags:`, tags);

    // Re-check: a concurrent invocation may have inserted while we awaited.
    if (document.querySelector(`.${BADGE_CLASS}-wrap--detail`)) return;

    // Locate the cluster freshly — React's hydration can replace the element
    // we found before the await, leaving us holding a detached node.
    const cluster = findCommitDetailRightCluster(ctx.sha);
    if (
      !cluster ||
      !cluster.parentElement ||
      !document.body.contains(cluster)
    ) {
      LOG(
        "commit detail cluster gone before insert; will retry on next observation",
      );
      return;
    }

    const wrap = document.createElement("span");
    wrap.className = `${BADGE_CLASS}-wrap ${BADGE_CLASS}-wrap--detail`;
    for (const name of tags) {
      const badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.textContent = name;
      badge.title = `Tag: ${name}`;
      wrap.appendChild(badge);
    }

    // Insert as the PREVIOUS SIBLING of the parent-info element so the badge
    // sits immediately to the left of "1 parent …", inside the same flex
    // group rather than in a wrapper that may include trailing spacers.
    cluster.parentElement.insertBefore(wrap, cluster);
    LOG("commit detail badges inserted before anchor:", cluster);
  }

  function findCommitDetailRightCluster(fullSha) {
    // Find the SMALLEST element whose text STARTS with "N parent" — that's
    // the inline element rendering the "1 parent" / "2 parents" run. The
    // badge inserts as its previous sibling, which places it immediately to
    // the left of "1 parent" inside the same horizontal flex group.
    const LEADING = /^\s*\d+\s+parent[s]?\b/i;

    let best = null;
    let bestSize = Infinity;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(el) {
          const text = (el.textContent || "").trim();
          if (text.length === 0 || text.length > 200)
            return NodeFilter.FILTER_SKIP;
          if (!LEADING.test(text)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    while (walker.nextNode()) {
      const el = walker.currentNode;
      const size = el.getElementsByTagName("*").length;
      if (size < bestSize) {
        best = el;
        bestSize = size;
      }
    }

    if (best) {
      LOG("commit detail anchor (smallest leading-parent match):", best);
      return best;
    }

    WARN("commit detail anchor not found");
    return null;
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
  window.__ghCommitTags = {
    processPage,
    fetchTagMap,
    lookupTagsForSha,
    findCommitRows,
    findCommitDetailRightCluster,
  };

  init();
  document.addEventListener("turbo:load", init);
  document.addEventListener("pjax:end", init);
})();
