-- Tambah kolom username secara nullable dulu agar bisa diisi sebelum set NOT NULL
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Isi username dari bagian sebelum '@' pada email (untuk baris yang sudah ada)
UPDATE "users" SET "username" = SPLIT_PART("email", '@', 1) WHERE "username" IS NULL;

-- Set NOT NULL setelah semua baris terisi
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- Tambah unique constraint
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Buat tabel refresh_tokens
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
