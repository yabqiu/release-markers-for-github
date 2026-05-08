# Release Markers for GitHub

A small Chrome extension that adds release-tag pills next to commits on
GitHub commits pages and single-commit pages, so you can see at a glance
which commit shipped as which release.

GitHub's commits page shows author, message, and "Verified" — but it
doesn't tell you that commit `7a62976` is the one tagged as `1.10.1`.
This extension adds that missing signal inline.

## Features

- Shows tag names (e.g. `1.10.1`, `v2.4.0`) as pills next to each commit
  that is the direct target of a git tag.
- One pill per tag — if a commit has multiple tags, every tag is shown.
- On the **commits list** page, pills sit immediately to the left of
  GitHub's "Verified" badge.
- On a **single commit** page (`/commit/<sha>`), pills sit immediately
  to the left of the "1 parent … commit …" cluster.
- Works on **public and private repositories** by reusing your existing
  GitHub session — no Personal Access Token required.
- Re-renders automatically when you navigate between branches or
  commits via Turbo (no full page reload needed).

## How it works

When you visit a `https://github.com/<owner>/<repo>/commits/<branch>`
URL or a `https://github.com/<owner>/<repo>/commit/<sha>` URL, the
extension:

1. Reads the commit row(s) already rendered on the page to collect
   their SHAs (or, on a single-commit page, takes the SHA from the
   URL).
2. Fetches `https://github.com/<owner>/<repo>/tags` once (using your
   existing session cookies) to get the tag-to-commit mapping for that
   repository.
3. For each commit whose SHA matches a tag, injects a styled pill with
   the tag name into the row's metadata area.

No data ever leaves your browser. The extension talks only to
`github.com`. See [PRIVACY.md](PRIVACY.md) for full details.

## Installation

### From the Chrome Web Store

_Coming soon._

### From source (development)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select this project's directory.
5. Visit any GitHub commits page, e.g.
   <https://github.com/torvalds/linux/commits/master>.

## Project layout

```
release-markers-for-github/
├── manifest.json   # Manifest V3 extension manifest
├── content.js      # Content script: scrapes SHAs, fetches tags, injects pills
├── styles.css      # Pill styling (light + dark mode)
├── icons/          # 16/48/128 px icons
├── PRIVACY.md      # Privacy policy
├── STORE_LISTING.md# Copy used in the Chrome Web Store listing
└── README.md
```

## Permissions

- **Host permission `https://github.com/*`** — required to run on
  GitHub commit pages and to fetch the repository's `/tags` page.

No other permissions are requested.

## Development

There is no build step. After editing `content.js` or `styles.css`,
reload the extension at `chrome://extensions` (refresh icon on the
extension card) and reload the GitHub page.

To debug, open DevTools on a GitHub commits page and filter the console
by `[gh-commit-tags]`.

## License

GPL-3.0 — see [LICENSE](LICENSE) for the full text.

```
Release Markers for GitHub  Copyright (C) 2026  Yanbin Qiu
This program comes with ABSOLUTELY NO WARRANTY.
This is free software, and you are welcome to redistribute it
under certain conditions; see the LICENSE file for details.
```

## Author

**Yanbin** — <https://yanbin.blog>
