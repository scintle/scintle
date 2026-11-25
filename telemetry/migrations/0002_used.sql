-- How many of a day's messages said each feature was used (D26): yes/no per message, so these are counts of installs.
ALTER TABLE counts ADD COLUMN used_board INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_lineage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_replay INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_plan INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_research INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_ask INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_correct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_triage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counts ADD COLUMN used_new_idea INTEGER NOT NULL DEFAULT 0;
