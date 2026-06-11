-- Weekly Vote — "Edit vs Edit" matchups that roll over every Sunday at
-- Berlin midnight. One matchup per week, one cast per visitor per week.
--
-- week_key: ISO date string (YYYY-MM-DD) of the Sunday that starts the
-- week. Computed client- and server-side from the current Berlin
-- calendar day. Sunday 2026-06-01 == week_key "2026-06-01".

CREATE TABLE IF NOT EXISTS vote_match (
  week_key   TEXT    PRIMARY KEY,
  edit_a     TEXT    NOT NULL,
  edit_b     TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  -- Track who set this matchup: 'admin' (via PUT) or 'auto' (lazy random
  -- pick on first GET of an empty week). Lets the admin UI later show
  -- which were curated vs. fallback.
  origin     TEXT    NOT NULL DEFAULT 'auto'
);

CREATE TABLE IF NOT EXISTS vote_cast (
  week_key   TEXT    NOT NULL,
  visitor_id TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL,
  edit       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (week_key, visitor_id)
);

-- Count tallies per (week, edit) — hot path on every Vote card render.
CREATE INDEX IF NOT EXISTS idx_vote_cast_week_edit ON vote_cast (week_key, edit);

-- Anti-double-vote check by IP (covers the case where the visitor clears
-- localStorage and gets a fresh visitor_id mid-week).
CREATE INDEX IF NOT EXISTS idx_vote_cast_week_ip   ON vote_cast (week_key, ip_hash);
