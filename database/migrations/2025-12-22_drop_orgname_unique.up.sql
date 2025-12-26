-- Migration: drop unique constraint on Organizations.OrgName to allow duplicate organization names
ALTER TABLE Organizations DROP INDEX OrgName;
-- Add non-unique index for performance
CREATE INDEX idx_orgname_v1 ON Organizations (OrgName);
