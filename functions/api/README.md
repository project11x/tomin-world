# Live portfolio sync — setup

`/api/portfolio` lists the R2 bucket on demand so the site picks up new
uploads without a redeploy. A successful response replaces the baked
`data.js` snapshot in-memory; views that re-render lazily (mag grid,
BTS folder list, Finder favorites) automatically show the new content
on the next user interaction. Folders that have changed get refreshed
in any already-open Finder windows immediately.

## One-time Cloudflare setup

Pages dashboard → your project → **Settings** → **Functions** → **R2 bucket bindings** → *Add binding*:

| Field        | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Variable name | `PORTFOLIO_BUCKET`                                            |
| R2 bucket     | the bucket whose public URL is `pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev` |

Save and redeploy once.

That's it — every subsequent upload to that bucket is visible on the
next page load (≤5 min on Cloudflare's edge cache, served stale-while-
revalidate so the user never blocks on the listing).

## Behaviour: additive only

The frontend merge is **strictly additive** — it adds folders / files
the baked `data.js` doesn't know about, and never deletes or rewrites
anything that already shipped with the build. That means:

| Action                      | Visible after                              |
| --------------------------- | ------------------------------------------ |
| New upload to R2            | ≤5 min (edge cache TTL)                    |
| Delete in R2                | requires a redeploy of `data.js`           |
| Folder rename               | requires a redeploy of `data.js`           |
| Local `npm run sync` change | next deploy (unchanged)                    |

Why: an earlier version replaced the local snapshot wholesale and got
caught out the moment the R2 listing was incomplete or structured
differently — the page rendered with no edits at all. The current
behaviour treats the live listing as a *supplement*, not a replacement,
so it can never break what's already on the site.

If you need an instant flush after an upload, purge the Pages cache
from the Cloudflare dashboard.

## Without the binding

If `PORTFOLIO_BUCKET` is missing, the function returns a 500 with
`{ error: 'PORTFOLIO_BUCKET binding missing' }`. The frontend swallows
that silently and keeps using the baked `data.js` — so an unconfigured
binding never breaks the site, it just disables the live sync.
