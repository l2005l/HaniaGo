-- Flight price alerts: one row per alert. device = the phone that made it; user_id = the
-- Hania360 account (empty without one); endpoint = that phone's push address, when allowed.
CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY, device TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT '', endpoint TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, ret TEXT NOT NULL DEFAULT '', flex INTEGER NOT NULL DEFAULT 0, direct INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL, start_price INTEGER NOT NULL DEFAULT 0, best_price INTEGER NOT NULL DEFAULT 0, best_date TEXT NOT NULL DEFAULT '', best_link TEXT NOT NULL DEFAULT '',
  notified_price INTEGER NOT NULL DEFAULT 0, checked INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS price_alerts_device ON price_alerts (device);
CREATE INDEX IF NOT EXISTS price_alerts_user ON price_alerts (user_id);
CREATE INDEX IF NOT EXISTS price_alerts_checked ON price_alerts (checked);
