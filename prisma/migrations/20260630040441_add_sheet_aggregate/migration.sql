-- CreateEnum
CREATE TYPE "AggregateOp" AS ENUM ('SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN');

-- CreateTable
CREATE TABLE "sheet_aggregates" (
    "id" UUID NOT NULL,
    "sheetId" UUID NOT NULL,
    "targetColumnId" UUID NOT NULL,
    "op" "AggregateOp" NOT NULL,

    CONSTRAINT "sheet_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_aggregates_sheetId_idx" ON "sheet_aggregates"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_aggregates_sheetId_targetColumnId_op_key" ON "sheet_aggregates"("sheetId", "targetColumnId", "op");

-- AddForeignKey
ALTER TABLE "sheet_aggregates" ADD CONSTRAINT "sheet_aggregates_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_aggregates" ADD CONSTRAINT "sheet_aggregates_targetColumnId_fkey" FOREIGN KEY ("targetColumnId") REFERENCES "columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
