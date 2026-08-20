-- AlterTable
ALTER TABLE `Note` ADD COLUMN `contentText` MEDIUMTEXT NOT NULL,
    MODIFY `content` MEDIUMTEXT NOT NULL;

-- Fill contentText for notes written before this column existed. Stripping the
-- tags in SQL is a rougher job than the application does, but it only has to
-- cover rows that are already here - everything written after this goes through
-- htmlToText on the way in.
UPDATE `Note` SET `contentText` = TRIM(REGEXP_REPLACE(`content`, '<[^>]*>', ' '));

-- CreateIndex
CREATE INDEX `Note_authorId_updatedAt_idx` ON `Note`(`authorId`, `updatedAt`);
