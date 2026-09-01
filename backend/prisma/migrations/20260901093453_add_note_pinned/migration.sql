-- AlterTable
ALTER TABLE `Note` ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Note_authorId_pinned_updatedAt_idx` ON `Note`(`authorId`, `pinned`, `updatedAt`);
