/*
  Warnings:

  - Added the required column `boardRank` to the `draft_prospect_bookmarks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "draft_prospect_bookmarks" ADD COLUMN     "boardRank" INTEGER NOT NULL;
