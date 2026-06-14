import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.util';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
  const prisma = new PrismaClient({ adapter });

  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  const kaprodiPassword = process.env['SEED_KAPRODI_PASSWORD'];

  if (!adminPassword || !kaprodiPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD dan SEED_KAPRODI_PASSWORD harus diisi di .env',
    );
  }

  await prisma.user.upsert({
    where: { email: 'admin@kampus.ac.id' },
    update: { username: 'admin' },
    create: {
      email: 'admin@kampus.ac.id',
      username: 'admin',
      fullName: 'Administrator',
      role: 'ADMIN',
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await prisma.user.upsert({
    where: { email: 'kaprodi@kampus.ac.id' },
    update: { username: 'kaprodi' },
    create: {
      email: 'kaprodi@kampus.ac.id',
      username: 'kaprodi',
      fullName: 'Kepala Program Studi',
      role: 'KAPRODI',
      passwordHash: await hashPassword(kaprodiPassword),
    },
  });

  console.log('Seed selesai: admin & kaprodi berhasil di-upsert.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
