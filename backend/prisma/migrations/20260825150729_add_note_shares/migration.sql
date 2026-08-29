-- CreateTable
CREATE TABLE `NoteShare` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `noteId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `permission` ENUM('view', 'edit') NOT NULL DEFAULT 'view',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NoteShare_userId_idx`(`userId`),
    UNIQUE INDEX `NoteShare_noteId_userId_key`(`noteId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `NoteShare` ADD CONSTRAINT `NoteShare_noteId_fkey` FOREIGN KEY (`noteId`) REFERENCES `Note`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NoteShare` ADD CONSTRAINT `NoteShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
