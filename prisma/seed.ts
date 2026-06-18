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

  // Data contoh sementara — akan digantikan oleh hasil import Excel sungguhan.
  const SHEET_IDS = {
    dtps: '00000000-0000-0000-0002-000000000001',
  };

  await prisma.sheet.upsert({
    where: { id: SHEET_IDS.dtps },
    update: { name: 'DTPS', orderIndex: 0, menuItemId: MENU_IDS.dtps },
    create: {
      id: SHEET_IDS.dtps,
      name: 'DTPS',
      orderIndex: 0,
      menuItemId: MENU_IDS.dtps,
    },
  });

  console.log('Seed selesai: sheet contoh berhasil di-upsert.');

  // Kolom DTPS — 7 daun + 1 grup (Kualifikasi Akademik).
  // Sentinel UUID prefix 0003 untuk membedakan dari menu (0001) dan sheet (0002).
  // type pada node grup = TEXT (default schema); bukan null karena kolom non-nullable.
  // Frontend membedakan grup vs daun dari ada/tidaknya children di response.
  const COLUMN_IDS = {
    no:              '00000000-0000-0000-0003-000000000001',
    namaDosen:       '00000000-0000-0000-0003-000000000002',
    kualAkademik:    '00000000-0000-0000-0003-000000000003',
    magister:        '00000000-0000-0000-0003-000000000004',
    doktor:          '00000000-0000-0000-0003-000000000005',
    jabatanAkademik: '00000000-0000-0000-0003-000000000006',
    nidn:            '00000000-0000-0000-0003-000000000007',
    linkDokumen:     '00000000-0000-0000-0003-000000000008',
  };

  // Kolom top-level (parentColumnId = null)
  await prisma.column.upsert({
    where: { id: COLUMN_IDS.no },
    update: { name: 'No.', type: 'INTEGER', orderIndex: 1, parentColumnId: null },
    create: { id: COLUMN_IDS.no, sheetId: SHEET_IDS.dtps, name: 'No.', type: 'INTEGER', orderIndex: 1 },
  });

  await prisma.column.upsert({
    where: { id: COLUMN_IDS.namaDosen },
    update: { name: 'Nama Dosen', type: 'TEXT', orderIndex: 2, parentColumnId: null },
    create: { id: COLUMN_IDS.namaDosen, sheetId: SHEET_IDS.dtps, name: 'Nama Dosen', type: 'TEXT', orderIndex: 2 },
  });

  // Node grup — type wajib diisi karena non-nullable di schema; pakai default TEXT.
  await prisma.column.upsert({
    where: { id: COLUMN_IDS.kualAkademik },
    update: { name: 'Kualifikasi Akademik', type: 'TEXT', orderIndex: 3, parentColumnId: null },
    create: { id: COLUMN_IDS.kualAkademik, sheetId: SHEET_IDS.dtps, name: 'Kualifikasi Akademik', type: 'TEXT', orderIndex: 3 },
  });

  // Anak dari Kualifikasi Akademik
  await prisma.column.upsert({
    where: { id: COLUMN_IDS.magister },
    update: { name: 'Magister', type: 'TEXT', orderIndex: 1, parentColumnId: COLUMN_IDS.kualAkademik },
    create: { id: COLUMN_IDS.magister, sheetId: SHEET_IDS.dtps, name: 'Magister', type: 'TEXT', orderIndex: 1, parentColumnId: COLUMN_IDS.kualAkademik },
  });

  await prisma.column.upsert({
    where: { id: COLUMN_IDS.doktor },
    update: { name: 'Doktor', type: 'TEXT', orderIndex: 2, parentColumnId: COLUMN_IDS.kualAkademik },
    create: { id: COLUMN_IDS.doktor, sheetId: SHEET_IDS.dtps, name: 'Doktor', type: 'TEXT', orderIndex: 2, parentColumnId: COLUMN_IDS.kualAkademik },
  });

  await prisma.column.upsert({
    where: { id: COLUMN_IDS.jabatanAkademik },
    update: { name: 'Jabatan Akademik', type: 'TEXT', orderIndex: 4, parentColumnId: null },
    create: { id: COLUMN_IDS.jabatanAkademik, sheetId: SHEET_IDS.dtps, name: 'Jabatan Akademik', type: 'TEXT', orderIndex: 4 },
  });

  // NIDN wajib TEXT — nol di depan harus utuh (mis. "0017026012")
  await prisma.column.upsert({
    where: { id: COLUMN_IDS.nidn },
    update: { name: 'NIDN', type: 'TEXT', orderIndex: 5, parentColumnId: null },
    create: { id: COLUMN_IDS.nidn, sheetId: SHEET_IDS.dtps, name: 'NIDN', type: 'TEXT', orderIndex: 5 },
  });

  await prisma.column.upsert({
    where: { id: COLUMN_IDS.linkDokumen },
    update: { name: 'Link Dokumen', type: 'URL', orderIndex: 6, parentColumnId: null },
    create: { id: COLUMN_IDS.linkDokumen, sheetId: SHEET_IDS.dtps, name: 'Link Dokumen', type: 'URL', orderIndex: 6 },
  });

  console.log('Seed selesai: kolom DTPS berhasil di-upsert (7 daun + 1 grup).');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
