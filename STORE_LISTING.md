# Chrome Web Store Listing — Release Markers for GitHub

Copy-paste this when filling in the Developer Dashboard form. Field names
match the dashboard.

---

## Item name

`Release Markers for GitHub`

## Summary _(132 char max)_

`See which commit shipped as which release. Adds inline tag badges to GitHub commit pages — works on private repos too.`

## Detailed description

```
GitHub's commits page tells you who committed what and when, but it doesn't
tell you which commit was tagged as v1.2.3 — you have to drill into the tags
page or guess. Release Markers fixes that.

For every commit row that's the target of a git tag, this extension adds a
small pill showing the tag name (e.g. "v1.2.3", "1.10.1"), placed inline
next to GitHub's existing "Verified" badge. If a commit is the target of
multiple tags, every tag is shown as its own pill.

WHERE IT WORKS
• Any commits page on github.com, public or private (e.g.
  github.com/owner/repo/commits/main)
• Both classic and modern GitHub UI layouts
• Updates automatically as you navigate between branches

HOW IT WORKS
The extension fetches your repository's tag list using your existing
GitHub session — no Personal Access Token, no extra login, no separate
account. The mapping is cached only in memory for the current page load.

PRIVACY
• No data collection, no telemetry, no analytics.
• No data leaves your browser. The extension talks only to github.com,
  using your existing session.
• Open-source code so you can verify exactly what it does.

PERMISSIONS
• "Read and change your data on github.com" — required to read the
  commits page you're viewing and to fetch the repository's tag list on
  your behalf. The extension does not modify any data on GitHub; it only
  adds visual badges to your local view.

Built for engineers who spend a lot of time staring at /commits pages
trying to figure out where the last release ended.
```

## Category

`Developer Tools`

## Language

`English`

---

## Privacy practices tab

### Single purpose

```
Display git tag names as inline badges next to commits on GitHub commit
listing pages, so users can see which commit corresponds to which release
without leaving the page.
```

### Permission justification — `host_permissions: https://github.com/*`

```
Required to run the content script on GitHub commit pages
(github.com/<owner>/<repo>/commits/<branch>) and to fetch the
corresponding /tags page so the extension can map tags to commit SHAs.
The extension only reads pages the user has already navigated to and
does not modify any GitHub data.
```

### Data usage disclosures

Tick:
- [x] I do not collect or use user data.
- [x] I do not sell or transfer user data to third parties.
- [x] I do not use or transfer user data for purposes unrelated to the item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

`https://yanbin.blog/release-markers-for-github/privacy`
_(Publish PRIVACY.md at this URL or wherever your blog hosts pages.)_

---

## Distribution

- **Visibility**: Public
- **Regions**: All regions
- **Pricing**: Free

---

## Assets you still need to produce

- **Icon 128×128** (already in `icons/icon128.png` — replace placeholder
  before submitting if you have a designer-made one)
- **Screenshot 1280×800 or 640×400** — at least one, up to five. Best
  capture: a real commits page where 2–3 release pills are visible. The
  screenshots are the single most impactful part of the listing.
- **Small promo tile 440×280** _(optional but boosts placement)_

---

## Update workflow

When shipping a new version:

1. Bump `version` in `manifest.json` (e.g. `0.1.0` → `0.1.1`).
2. Re-zip:
   ```
   cd /Users/yanbin.qiu/Workspaces/github/github-commit-tag
   zip -r release-markers-for-github-<version>.zip \
     manifest.json content.js styles.css icons
   ```
3. Upload the new ZIP in the Developer Dashboard's "Package" tab.
4. Submit for review. Review typically takes a few hours to a few days.
