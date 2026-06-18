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

  // Data contoh sementara — akan digantikan oleh hasil import Excel sungguhan.
  // 3 baris cukup untuk membuktikan pivot; 24 baris penuh adalah tugas import (T5).
  const ROW_IDS = {
    row1: '00000000-0000-0000-0004-000000000001',
    row2: '00000000-0000-0000-0004-000000000002',
    row3: '00000000-0000-0000-0004-000000000003',
  };

  // Alias ke COLUMN_IDS sentinel 3c agar mudah dibaca
  const C = {
    no:              '00000000-0000-0000-0003-000000000001',
    namaDosen:       '00000000-0000-0000-0003-000000000002',
    // kualAkademik  '...0003' — node grup, tidak punya Cell
    magister:        '00000000-0000-0000-0003-000000000004',
    doktor:          '00000000-0000-0000-0003-000000000005',
    jabatanAkademik: '00000000-0000-0000-0003-000000000006',
    nidn:            '00000000-0000-0000-0003-000000000007',
    linkDokumen:     '00000000-0000-0000-0003-000000000008',
  };

  await prisma.row.upsert({
    where: { id: ROW_IDS.row1 },
    update: { orderIndex: 1 },
    create: { id: ROW_IDS.row1, sheetId: SHEET_IDS.dtps, orderIndex: 1 },
  });
  await prisma.row.upsert({
    where: { id: ROW_IDS.row2 },
    update: { orderIndex: 2 },
    create: { id: ROW_IDS.row2, sheetId: SHEET_IDS.dtps, orderIndex: 2 },
  });
  await prisma.row.upsert({
    where: { id: ROW_IDS.row3 },
    update: { orderIndex: 3 },
    create: { id: ROW_IDS.row3, sheetId: SHEET_IDS.dtps, orderIndex: 3 },
  });

  // Helper upsert cell — unique constraint (rowId, columnId) dipakai sebagai where
  const upsertCell = (rowId: string, columnId: string, value: string | null) =>
    prisma.cell.upsert({
      where: { rowId_columnId: { rowId, columnId } },
      update: { value },
      create: { rowId, columnId, value },
    });

  // Baris 1 — semua kolom daun terisi; NIDN dengan nol di depan (DoD Sprint 1)
  await upsertCell(ROW_IDS.row1, C.no, '1');
  await upsertCell(ROW_IDS.row1, C.namaDosen, 'Dr. Andi Susanto, M.T., Ph.D.');
  await upsertCell(ROW_IDS.row1, C.magister, 'Teknik Informatika');
  await upsertCell(ROW_IDS.row1, C.doktor, 'Computer Science');
  await upsertCell(ROW_IDS.row1, C.jabatanAkademik, 'Profesor');
  await upsertCell(ROW_IDS.row1, C.nidn, '0017026012');
  await upsertCell(ROW_IDS.row1, C.linkDokumen, 'https://drive.google.com/file/d/abc/view');

  // Baris 2 — kolom Doktor sengaja tidak diisi → pivot harus menghasilkan null
  await upsertCell(ROW_IDS.row2, C.no, '2');
  await upsertCell(ROW_IDS.row2, C.namaDosen, 'Dr. Budi Santoso, M.Kom.');
  await upsertCell(ROW_IDS.row2, C.magister, 'Ilmu Komputer');
  // C.doktor dikosongkan — tidak ada baris Cell untuk kombinasi ini
  await upsertCell(ROW_IDS.row2, C.jabatanAkademik, 'Lektor Kepala');
  await upsertCell(ROW_IDS.row2, C.nidn, '0023051978');
  await upsertCell(ROW_IDS.row2, C.linkDokumen, 'https://drive.google.com/file/d/def/view');

  // Baris 3 — kolom Link Dokumen sengaja tidak diisi → pivot null
  await upsertCell(ROW_IDS.row3, C.no, '3');
  await upsertCell(ROW_IDS.row3, C.namaDosen, 'Ir. Citra Dewi, M.T.');
  await upsertCell(ROW_IDS.row3, C.magister, 'Teknik Elektro');
  await upsertCell(ROW_IDS.row3, C.doktor, null);
  await upsertCell(ROW_IDS.row3, C.jabatanAkademik, 'Lektor');
  await upsertCell(ROW_IDS.row3, C.nidn, '0011081985');
  // C.linkDokumen dikosongkan

  console.log('Seed selesai: 3 baris contoh DTPS + cell berhasil di-upsert.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});