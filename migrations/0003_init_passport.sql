-- Passport Code — opt-in cross-device sync.
--
-- A visitor generates a 6-character code on device A; the code maps to a
-- JSON blob containing every journal-related localStorage key (rings,
-- stats, stamps earned, game high scores, vote week, etc.). On device B
-- they enter the code and the state is hydrated locally.
--
-- No PII: code is anonymous, state is opaque JSON. Visitors who lose
-- the code can't recover it — that's the trade-off for not requiring
-- accounts.

CREATE TABLE IF NOT EXISTS passport_code (
  code       TEXT    PRIMARY KEY,
  state      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passport_updated ON passport_code (updated_at);
