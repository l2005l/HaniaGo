-- Optional link between a Hania360 account (Hania Pass user id) and a trip.
-- HaniaGo still works with no account; this only lets Hania Today show the next trip.
CREATE TABLE IF NOT EXISTS account_trip (
  user_id TEXT NOT NULL, trip TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY (user_id, trip));
CREATE INDEX IF NOT EXISTS account_trip_trip ON account_trip (trip);
