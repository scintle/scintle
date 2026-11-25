-- Totals only: one row per UTC day and field combination. No message is ever stored (D26).
CREATE TABLE counts (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  install_month TEXT NOT NULL,
  pings INTEGER NOT NULL DEFAULT 0,
  new_installs INTEGER NOT NULL DEFAULT 0,
  week_firsts INTEGER NOT NULL DEFAULT 0,
  month_firsts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version, os, arch, install_month)
);
