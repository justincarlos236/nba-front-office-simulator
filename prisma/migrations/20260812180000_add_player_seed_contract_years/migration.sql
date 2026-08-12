-- Real imported contracts, used to seed a new league's opening salaries.
-- Additive and optional: a player without rows here gets a generated contract,
-- which is exactly what every player got before this table existed.
CREATE TABLE "player_seed_contract_years" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "salaryCents" BIGINT NOT NULL,

    CONSTRAINT "player_seed_contract_years_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_seed_contract_years_playerId_season_key"
    ON "player_seed_contract_years"("playerId", "season");

ALTER TABLE "player_seed_contract_years"
    ADD CONSTRAINT "player_seed_contract_years_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
