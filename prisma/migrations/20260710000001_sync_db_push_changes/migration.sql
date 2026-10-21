-- =============================================================================
-- Baseline migration: consolidates all schema changes applied via `db push`
-- after the last tracked migration (20260707085552_add_email_verification).
-- This file was created manually with `migrate resolve --applied` to register
-- changes that are already present in the database.
--
-- Every statement is guarded with IF NOT EXISTS: some of these columns
-- (channel_configs.buffer_profile_id, buffer_connections.token_expires_at,
-- buffer_connections.created_at) are already created by the init migration, so
-- unguarded ADD COLUMNs fail with 42701 when migrating a fresh database.
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- ChannelConfig: add Buffer profile fields + is_active
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "channel_configs"
  ADD COLUMN IF NOT EXISTS "buffer_profile_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "buffer_profile_name" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active"           BOOLEAN NOT NULL DEFAULT true;

-- Change enabled default from true to false (channels disabled until Buffer syncs)
ALTER TABLE "channel_configs" ALTER COLUMN "enabled" SET DEFAULT false;

-- Replace old unique (company_id, channel) with (company_id, buffer_profile_id)
DROP INDEX IF EXISTS "channel_configs_company_id_channel_key";

CREATE UNIQUE INDEX IF NOT EXISTS "channel_configs_company_id_buffer_profile_id_key"
  ON "channel_configs"("company_id", "buffer_profile_id");

CREATE INDEX IF NOT EXISTS "channel_configs_company_id_is_active_idx"
  ON "channel_configs"("company_id", "is_active");

-- ────────────────────────────────────────────────────────────────────────────
-- BufferConnection: add token expiry, sync timestamp, and audit timestamps
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "buffer_connections"
  ADD COLUMN IF NOT EXISTS "token_expires_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_profile_sync_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ────────────────────────────────────────────────────────────────────────────
-- Post: add direct link to the published social media post
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "published_post_url" TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- FeedItem: allow per-article enable/disable (enabled = true by default)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "feed_items"
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
