-- CreateEnum
CREATE TYPE "Conference" AS ENUM ('EAST', 'WEST');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('PG', 'SG', 'SF', 'PF', 'C');

-- CreateEnum
CREATE TYPE "InjuryStatus" AS ENUM ('HEALTHY', 'DAY_TO_DAY', 'OUT', 'SEASON_ENDING');

-- CreateEnum
CREATE TYPE "ContractOptionType" AS ENUM ('NONE', 'PLAYER_OPTION', 'TEAM_OPTION');

-- CreateEnum
CREATE TYPE "ExceptionUsed" AS ENUM ('NONE', 'MAX', 'MID_LEVEL_TAXPAYER', 'MID_LEVEL_ROOM', 'MID_LEVEL_NON_TAXPAYER', 'BI_ANNUAL', 'ROOKIE_SCALE', 'VETERAN_MINIMUM', 'BIRD_RIGHTS', 'EARLY_BIRD_RIGHTS', 'NON_BIRD_RIGHTS');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeAssetType" AS ENUM ('PLAYER', 'DRAFT_PICK', 'CASH', 'TRADE_EXCEPTION');

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "abbreviation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "conference" "Conference" NOT NULL,
    "division" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "logoUrl" TEXT,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "fullName" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "birthDate" TIMESTAMP(3),
    "heightInches" INTEGER,
    "weightLbs" INTEGER,
    "draftYear" INTEGER,
    "draftRound" INTEGER,
    "draftPick" INTEGER,
    "photoUrl" TEXT,
    "currentTeamId" TEXT,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_season_stats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "minutesPerGame" DOUBLE PRECISION NOT NULL,
    "pointsPerGame" DOUBLE PRECISION NOT NULL,
    "reboundsPerGame" DOUBLE PRECISION NOT NULL,
    "assistsPerGame" DOUBLE PRECISION NOT NULL,
    "stealsPerGame" DOUBLE PRECISION NOT NULL,
    "blocksPerGame" DOUBLE PRECISION NOT NULL,
    "turnoversPerGame" DOUBLE PRECISION NOT NULL,
    "fgPct" DOUBLE PRECISION,
    "fg3Pct" DOUBLE PRECISION,
    "ftPct" DOUBLE PRECISION,
    "trueShootingPct" DOUBLE PRECISION,
    "usagePct" DOUBLE PRECISION,
    "winSharesPer48" DOUBLE PRECISION,
    "boxPlusMinus" DOUBLE PRECISION,
    "valueOverReplacement" DOUBLE PRECISION,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userControlledTeamId" TEXT,
    "currentSeason" INTEGER NOT NULL,
    "seasonStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salaryCapOverrideCents" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_teams" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "league_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_players" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "leagueTeamId" TEXT,
    "overallRating" INTEGER NOT NULL,
    "potentialRating" INTEGER NOT NULL,
    "injuryStatus" "InjuryStatus" NOT NULL DEFAULT 'HEALTHY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "league_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "signedSeason" INTEGER NOT NULL,
    "startSeason" INTEGER NOT NULL,
    "endSeason" INTEGER NOT NULL,
    "noTradeClause" BOOLEAN NOT NULL DEFAULT false,
    "signedUsing" "ExceptionUsed" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_years" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "salaryCents" BIGINT NOT NULL,
    "guaranteedCents" BIGINT NOT NULL,
    "optionType" "ContractOptionType" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "contract_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_picks" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "originalTeamId" TEXT NOT NULL,
    "currentOwnerId" TEXT NOT NULL,
    "protectionNote" TEXT,

    CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PROPOSED',
    "validationResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_assets" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "type" "TradeAssetType" NOT NULL,
    "fromLeagueTeamId" TEXT NOT NULL,
    "toLeagueTeamId" TEXT NOT NULL,
    "leaguePlayerId" TEXT,
    "draftPickId" TEXT,
    "cashCents" BIGINT,

    CONSTRAINT "trade_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_exceptions" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "trade_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_threads" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolResultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "teams_externalId_key" ON "teams"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_abbreviation_key" ON "teams"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "players_externalId_key" ON "players"("externalId");

-- CreateIndex
CREATE INDEX "players_currentTeamId_idx" ON "players"("currentTeamId");

-- CreateIndex
CREATE INDEX "player_season_stats_playerId_idx" ON "player_season_stats"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_stats_playerId_season_team_key" ON "player_season_stats"("playerId", "season", "team");

-- CreateIndex
CREATE INDEX "leagues_ownerId_idx" ON "leagues"("ownerId");

-- CreateIndex
CREATE INDEX "league_teams_leagueId_idx" ON "league_teams"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "league_teams_leagueId_teamId_key" ON "league_teams"("leagueId", "teamId");

-- CreateIndex
CREATE INDEX "league_players_leagueId_leagueTeamId_idx" ON "league_players"("leagueId", "leagueTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "league_players_leagueId_playerId_key" ON "league_players"("leagueId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_leaguePlayerId_key" ON "contracts"("leaguePlayerId");

-- CreateIndex
CREATE INDEX "contracts_leagueTeamId_idx" ON "contracts"("leagueTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_years_contractId_season_key" ON "contract_years"("contractId", "season");

-- CreateIndex
CREATE INDEX "draft_picks_leagueId_idx" ON "draft_picks"("leagueId");

-- CreateIndex
CREATE INDEX "trades_leagueId_idx" ON "trades"("leagueId");

-- CreateIndex
CREATE INDEX "trade_assets_tradeId_idx" ON "trade_assets"("tradeId");

-- CreateIndex
CREATE INDEX "trade_exceptions_leagueId_leagueTeamId_idx" ON "trade_exceptions"("leagueId", "leagueTeamId");

-- CreateIndex
CREATE INDEX "assistant_threads_leagueId_idx" ON "assistant_threads"("leagueId");

-- CreateIndex
CREATE INDEX "assistant_messages_threadId_idx" ON "assistant_messages"("threadId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_players" ADD CONSTRAINT "league_players_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_players" ADD CONSTRAINT "league_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_players" ADD CONSTRAINT "league_players_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_years" ADD CONSTRAINT "contract_years_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_assets" ADD CONSTRAINT "trade_assets_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_assets" ADD CONSTRAINT "trade_assets_fromLeagueTeamId_fkey" FOREIGN KEY ("fromLeagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_assets" ADD CONSTRAINT "trade_assets_toLeagueTeamId_fkey" FOREIGN KEY ("toLeagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_assets" ADD CONSTRAINT "trade_assets_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "league_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_assets" ADD CONSTRAINT "trade_assets_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "draft_picks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_exceptions" ADD CONSTRAINT "trade_exceptions_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_exceptions" ADD CONSTRAINT "trade_exceptions_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_threads" ADD CONSTRAINT "assistant_threads_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "assistant_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
