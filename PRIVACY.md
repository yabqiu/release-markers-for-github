# Privacy Policy — Release Markers for GitHub

_Last updated: 2026-05-08_

**Release Markers for GitHub** ("the extension") is a Chrome browser extension
that adds release-tag badges to GitHub commit listing pages.

## Summary

The extension does not collect, store, sell, or transmit any personal data.
Everything it does happens locally in your browser.

## What the extension accesses

When you visit a URL matching `https://github.com/<owner>/<repo>/commits/<branch>`,
the extension:

1. Reads the rendered page's DOM to identify commit rows and their SHAs.
2. Sends a single request to `https://github.com/<owner>/<repo>/tags`, using
   your existing GitHub session cookies, to retrieve the tag-to-commit
   mapping for that repository.
3. Renders small badges next to commits whose SHAs appear in that mapping.

These requests go directly from your browser to `github.com`. They do not
pass through any third-party server operated by the extension's author.

## What the extension does **not** do

- It does not collect telemetry, analytics, or usage statistics.
- It does not store any data outside your browser session. The in-memory
  cache of tag-to-commit mappings is discarded as soon as the tab is
  closed or the page is reloaded.
- It does not read, transmit, or store your GitHub credentials, tokens,
  cookies, or any content of private repositories beyond what is required
  to render the badges on the page you are already viewing.
- It does not communicate with any server other than `github.com`.
- It does not modify any GitHub data; it only reads pages and adds visual
  elements to your local view of them.

## Permissions used

- **Host permission `https://github.com/*`** — required to run the content
  script on GitHub commit pages and to fetch the repository's tags page
  on your behalf.

No other permissions are requested.

## Third-party services

The extension communicates only with `github.com`, which has its own
[privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
The extension's author is not affiliated with GitHub or Microsoft.

## Children's privacy

The extension is not directed at children and does not knowingly process
data from children.

## Changes to this policy

If this policy changes, an updated version will be posted at the same URL
with a new "Last updated" date.

## Contact

If you have questions or concerns, contact:

- **Yanbin** — yabqiu@gmail.com
- Website: https://yanbin.blog
