-- Messages saying Claude looked up an idea through the Claude Code companion (D26, D32).
ALTER TABLE counts ADD COLUMN used_companion INTEGER NOT NULL DEFAULT 0;
