-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'KAPRODI');

-- CreateEnum
CREATE TYPE "ColumnType" AS ENUM ('DATE', 'TEXT', 'INTEGER', 'FLOAT', 'BOOLEAN', 'MARKING', 'URL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excel_imports" (
    "id" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excel_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheets" (
    "id" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "sourceImportId" UUID,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "parentColumnId" UUID,
    "name" TEXT NOT NULL,
    "type" "ColumnType" NOT NULL DEFAULT 'TEXT',
    "isFormula" BOOLEAN NOT NULL DEFAULT false,
    "formulaDefinition" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rows" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cells" (
    "id" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "columnId" UUID NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cell_merges" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "startRow" INTEGER NOT NULL,
    "endRow" INTEGER NOT NULL,
    "startCol" INTEGER NOT NULL,
    "endCol" INTEGER NOT NULL,

    CONSTRAINT "cell_merges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "menu_items_parentId_idx" ON "menu_items"("parentId");

-- CreateIndex
CREATE INDEX "excel_imports_uploadedById_idx" ON "excel_imports"("uploadedById");

-- CreateIndex
CREATE INDEX "sheets_menuItemId_idx" ON "sheets"("menuItemId");

-- CreateIndex
CREATE INDEX "columns_sheetId_idx" ON "columns"("sheetId");

-- CreateIndex
CREATE INDEX "columns_parentColumnId_idx" ON "columns"("parentColumnId");

-- CreateIndex
CREATE INDEX "rows_sheetId_idx" ON "rows"("sheetId");

-- CreateIndex
CREATE INDEX "cells_columnId_idx" ON "cells"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "cells_rowId_columnId_key" ON "cells"("rowId", "columnId");

-- CreateIndex
CREATE INDEX "cell_merges_sheetId_idx" ON "cell_merges"("sheetId");

-- CreateIndex
CREATE INDEX "change_logs_userId_idx" ON "change_logs"("userId");

-- CreateIndex
CREATE INDEX "change_logs_entityType_entityId_idx" ON "change_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excel_imports" ADD CONSTRAINT "excel_imports_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "excel_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_parentColumnId_fkey" FOREIGN KEY ("parentColumnId") REFERENCES "columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rows" ADD CONSTRAINT "rows_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cells" ADD CONSTRAINT "cells_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cells" ADD CONSTRAINT "cells_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_merges" ADD CONSTRAINT "cell_merges_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
