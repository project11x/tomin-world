-- Passport abuse limits + purge of the old, reversible IP hashes.
--
-- 1. passport_code.creator_ip_hash — who created a code (keyed hash, see
--    src/api/ip.js), so new codes can be rate-limited per network. Rows
--    from before this migration stay NULL and don't count.
-- 2. passport_miss — failed code lookups per network, to slow down
--    guessing codes (6 chars ≈ 1 billion, the code is the only secret).
-- 3. The IP hashes stored so far are plain SHA-256 and can be reversed to
--    the IP by brute force. New hashes are HMAC-keyed and never match the
--    old ones, so the old values are useless for rate limits — overwrite
--    them.

ALTER TABLE passport_code ADD COLUMN creator_ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_passport_creator ON passport_code (creator_ip_hash, created_at);

CREATE TABLE IF NOT EXISTS passport_miss (
  ip_hash    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_passport_miss_ip ON passport_miss (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_passport_miss_created ON passport_miss (created_at);

UPDATE pin SET ip_hash = 'purged';
UPDATE vote_cast SET ip_hash = 'purged';
