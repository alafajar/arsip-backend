-- CreateEnum
CREATE TYPE "FormulaOp" AS ENUM ('ADD', 'SUB', 'MUL', 'DIV', 'SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN');

-- AlterTable: ganti isFormula+formulaDefinition dengan formulaOp+formulaOperandIds
ALTER TABLE "columns"
  DROP COLUMN "isFormula",
  DROP COLUMN "formulaDefinition",
  ADD COLUMN "formulaOp"         "FormulaOp",
  ADD COLUMN "formulaOperandIds" TEXT[]       NOT NULL DEFAULT '{}';
