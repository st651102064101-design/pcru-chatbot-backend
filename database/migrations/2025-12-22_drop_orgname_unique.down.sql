-- Rollback: recreate unique constraint on OrgName
DROP INDEX IF EXISTS idx_orgname_v1 ON Organizations;
ALTER TABLE Organizations ADD UNIQUE INDEX OrgName (OrgName);
