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

  // Data contoh sementara — akan digantikan oleh hasil import Excel sungguhan.
  // UUID hardcoded agar upsert idempoten (name tidak @unique di schema).
  const MENU_IDS = {
    kriteria:    '00000000-0000-0000-0001-000000000001',
    dtps:        '00000000-0000-0000-0001-000000000002',
    profilDosen: '00000000-0000-0000-0001-000000000003',
    kurikulum:   '00000000-0000-0000-0001-000000000004',
  };

  await prisma.menuItem.upsert({
    where: { id: MENU_IDS.kriteria },
    update: { name: 'Kriteria', orderIndex: 0 },
    create: { id: MENU_IDS.kriteria, name: 'Kriteria', orderIndex: 0 },
  });

  await prisma.menuItem.upsert({
    where: { id: MENU_IDS.dtps },
    update: { name: 'DTPS', orderIndex: 0, parentId: MENU_IDS.kriteria },
    create: { id: MENU_IDS.dtps, name: 'DTPS', orderIndex: 0, parentId: MENU_IDS.kriteria },
  });

  await prisma.menuItem.upsert({
    where: { id: MENU_IDS.profilDosen },
    update: { name: 'Profil Dosen', orderIndex: 1, parentId: MENU_IDS.kriteria },
    create: { id: MENU_IDS.profilDosen, name: 'Profil Dosen', orderIndex: 1, parentId: MENU_IDS.kriteria },
  });

  await prisma.menuItem.upsert({
    where: { id: MENU_IDS.kurikulum },
    update: { name: 'Kurikulum', orderIndex: 1 },
    create: { id: MENU_IDS.kurikulum, name: 'Kurikulum', orderIndex: 1 },
  });

  console.log('Seed selesai: menu contoh berhasil di-upsert.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
