-- Defensive backfill for User.preferences (added v1.07.27).
--
-- `Json @default("{}")` in schema.prisma instructs `prisma db push` to add
-- the column with `DEFAULT '{}'::jsonb`, which Postgres applies to existing
-- rows on column creation. This script exists as a belt-and-suspenders
-- safety net: if a deploy ever lands the column without the default applied
-- (manual `ALTER TABLE`, partial migration, restore from older snapshot),
-- this query guarantees no row is left with NULL preferences.
--
-- Run with: psql $DATABASE_URL -f backfill_user_preferences.sql
-- Idempotent — safe to run repeatedly.

UPDATE users
SET preferences = '{}'::jsonb
WHERE preferences IS NULL;
