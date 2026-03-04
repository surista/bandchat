-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram index on Message.content for faster ILIKE searches
-- This index dramatically improves search performance for partial text matches
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_content_trgm_idx"
ON "Message" USING gin (content gin_trgm_ops);

-- Usage: This index will be used automatically for queries like:
-- SELECT * FROM "Message" WHERE content ILIKE '%search term%';
