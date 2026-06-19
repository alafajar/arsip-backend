-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sheets" ADD COLUMN     "isReadOnly" BOOLEAN NOT NULL DEFAULT false;
