-- Pinboard — visitors pin polaroids (from Eddie's portfolio) to a shared
-- cork board. One pin per IP per 24h; no free text; sticker + city are
-- the only adornments. Hidden pins are kept for audit but excluded from
-- the public board (admin can flip `hidden` from the Access-gated UI).

CREATE TABLE IF NOT EXISTS pin (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id      TEXT    NOT NULL,             -- random UUID, lives in localStorage
  ip_hash         TEXT    NOT NULL,             -- sha-256 of client IP (privacy, used for rate limit)
  polaroid_folder TEXT    NOT NULL,             -- e.g. "Lunatic" — validated against portfolioData
  polaroid_name   TEXT    NOT NULL,             -- e.g. "20250209-_DSC3184.jpg"
  polaroid_src    TEXT    NOT NULL,             -- already-encoded relative path, what the <img> loads
  sticker         TEXT,                          -- one of the preset emojis, optional
  city            TEXT,                          -- cf.city snapshot, optional
  country         TEXT,                          -- cf.country snapshot, optional
  created_at      INTEGER NOT NULL,             -- unix ms
  hidden          INTEGER NOT NULL DEFAULT 0    -- 1 = excluded from public board
);

-- Newest-first board fetch is the hot read path.
CREATE INDEX IF NOT EXISTS idx_pin_created_at ON pin (created_at DESC);

-- Rate-limit lookup: "did this IP pin in the last 24h?"
CREATE INDEX IF NOT EXISTS idx_pin_ip_hash    ON pin (ip_hash, created_at);

-- For "show me my own pins" / passport-code restore later.
CREATE INDEX IF NOT EXISTS idx_pin_visitor    ON pin (visitor_id);
