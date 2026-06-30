import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeAction, ColumnType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateValueForType } from '../columns/column-value.validator';
import { CreateRowDto } from './dto/create-row.dto';
import { UpdateRowDto } from './dto/update-row.dto';

export interface ColumnNode {
  id: string;
  name: string;
  type: ColumnType;
  orderIndex: number;
  children: ColumnNode[];
}

@Injectable()
export class SheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async getColumns(sheetId: string): Promise<ColumnNode[]> {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');

    const rows = await this.prisma.column.findMany({
      where: { sheetId },
      select: { id: true, name: true, type: true, orderIndex: true, parentColumnId: true },
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });

    // Bangun pohon di memori dari list datar — anti-N+1 (satu query, pivot di kode)
    const map = new Map<string, ColumnNode>();
    for (const row of rows) {
      map.set(row.id, { id: row.id, name: row.name, type: row.type, orderIndex: row.orderIndex, children: [] });
    }

    const roots: ColumnNode[] = [];
    for (const row of rows) {
      const node = map.get(row.id)!;
      if (row.parentColumnId === null) {
        roots.push(node);
      } else {
        map.get(row.parentColumnId)?.children.push(node);
      }
    }

    return roots;
  }

  async getRows(sheetId: string, limit: number, offset: number) {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);

    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');

    // Ambil semua columnId sheet sekali — dipakai untuk mengisi null pada kolom yang tidak punya Cell
    const columns = await this.prisma.column.findMany({
      where: { sheetId },
      select: { id: true },
    });
    const allColumnIds = columns.map((c) => c.id);

    const [total, dbRows] = await Promise.all([
      this.prisma.row.count({ where: { sheetId } }),
      this.prisma.row.findMany({
        where: { sheetId },
        select: {
          id: true,
          orderIndex: true,
          cells: { select: { columnId: true, value: true } },
        },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
        take: safeLimit,
        skip: safeOffset,
      }),
    ]);

    // Pivot di memori — anti-N+1: satu query baris+cell, lalu transformasi di kode
    const rows = dbRows.map((row) => {
      const cells: Record<string, string | null> = {};
      for (const colId of allColumnIds) {
        cells[colId] = null;
      }
      for (const cell of row.cells) {
        cells[cell.columnId] = cell.value ?? null;
      }
      return { rowId: row.id, orderIndex: row.orderIndex, cells };
    });

    return { rows, total, limit: safeLimit, offset: safeOffset };
  }

  private async assertWritableSheet(sheetId: string): Promise<void> {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true, isReadOnly: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');
    if (sheet.isReadOnly) throw new ConflictException('Sheet ini hanya-baca dan tidak bisa diubah');
  }

  async createRow(sheetId: string, dto: CreateRowDto, userId: string) {
    // 1. Sheet ada dan bisa ditulis?
    await this.assertWritableSheet(sheetId);

    // 2. Ambil semua kolom sheet: leaf map (untuk validasi) + all IDs (untuk null-fill respons)
    const allColumns = await this.prisma.column.findMany({
      where: { sheetId },
      select: { id: true, name: true, type: true, _count: { select: { childColumns: true } } },
    });
    const allColumnIds = allColumns.map((c) => c.id);
    const leafMap = new Map(
      allColumns
        .filter((c) => c._count.childColumns === 0)
        .map((c) => [c.id, { name: c.name, type: c.type }]),
    );

    // 3. Validasi berlapis — fail-fast sebelum menyentuh DB tulis
    const seenIds = new Set<string>();
    for (const cell of dto.cells) {
      const col = leafMap.get(cell.columnId);
      if (!col) {
        throw new BadRequestException(
          `columnId "${cell.columnId}" tidak ditemukan di sheet ini atau merupakan node grup.`,
        );
      }
      if (seenIds.has(cell.columnId)) {
        throw new BadRequestException(`columnId "${cell.columnId}" duplikat dalam payload.`);
      }
      seenIds.add(cell.columnId);
      validateValueForType(col.type, cell.value ?? null, col.name);
    }

    // 4. Transaksi atomik: baris + cell + audit (semua-atau-tidak)
    const newRow = await this.prisma.$transaction(async (tx) => {
      const last = await tx.row.findFirst({
        where: { sheetId },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      const orderIndex = (last?.orderIndex ?? 0) + 1;

      const row = await tx.row.create({
        data: { sheetId, orderIndex },
        select: { id: true, orderIndex: true },
      });

      if (dto.cells.length > 0) {
        await tx.cell.createMany({
          data: dto.cells.map((c) => ({
            rowId: row.id,
            columnId: c.columnId,
            value: c.value ?? null,
          })),
        });
      }

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Row',
          entityId: row.id,
          action: ChangeAction.CREATE,
          afterData: { sheetId, orderIndex: row.orderIndex },
        },
      });

      return row;
    });

    // 5. Bangun respons: bentuk sama dengan 3d (key semua columnId, nilai null bila tidak ada)
    const cellValueMap = new Map(dto.cells.map((c) => [c.columnId, c.value ?? null]));
    const cells: Record<string, string | null> = {};
    for (const colId of allColumnIds) {
      cells[colId] = cellValueMap.get(colId) ?? null;
    }

    return { rowId: newRow.id, orderIndex: newRow.orderIndex, cells };
  }

  async updateRow(sheetId: string, rowId: string, dto: UpdateRowDto, userId: string) {
    // 1. Sheet ada dan bisa ditulis?
    await this.assertWritableSheet(sheetId);

    // 2. Row ada DAN milik sheet ini? (cegah edit baris sheet lain via path palsu)
    const row = await this.prisma.row.findUnique({
      where: { id: rowId },
      select: { id: true, orderIndex: true, sheetId: true },
    });
    if (!row || row.sheetId !== sheetId) {
      throw new NotFoundException('Baris tidak ditemukan');
    }

    // 3. Ambil semua kolom sheet: leaf map (validasi) + all IDs (null-fill respons)
    const allColumns = await this.prisma.column.findMany({
      where: { sheetId },
      select: { id: true, name: true, type: true, _count: { select: { childColumns: true } } },
    });
    const allColumnIds = allColumns.map((c) => c.id);
    const leafMap = new Map(
      allColumns
        .filter((c) => c._count.childColumns === 0)
        .map((c) => [c.id, { name: c.name, type: c.type }]),
    );

    // 4. Validasi berlapis — fail-fast
    const seenIds = new Set<string>();
    for (const cell of dto.cells) {
      const col = leafMap.get(cell.columnId);
      if (!col) {
        throw new BadRequestException(
          `columnId "${cell.columnId}" tidak ditemukan di sheet ini atau merupakan node grup.`,
        );
      }
      if (seenIds.has(cell.columnId)) {
        throw new BadRequestException(`columnId "${cell.columnId}" duplikat dalam payload.`);
      }
      seenIds.add(cell.columnId);

      // Hanya nilai non-kosong yang perlu divalidasi tipe; kosong = perintah hapus
      const isEmpty = cell.value === null || cell.value === undefined || cell.value.trim() === '';
      if (!isEmpty) {
        validateValueForType(col.type, cell.value!, col.name);
      }
    }

    // 5. Transaksi atomik: upsert/hapus cell + sentuh updatedAt row + audit
    await this.prisma.$transaction(async (tx) => {
      for (const cell of dto.cells) {
        const isEmpty = cell.value === null || cell.value === undefined || cell.value.trim() === '';

        if (isEmpty) {
          // Kosongkan sel = hapus baris Cell (bukan simpan ""); aman jika belum ada
          await tx.cell.deleteMany({ where: { rowId, columnId: cell.columnId } });
        } else {
          await tx.cell.upsert({
            where: { rowId_columnId: { rowId, columnId: cell.columnId } },
            update: { value: cell.value },
            create: { rowId, columnId: cell.columnId, value: cell.value },
          });
        }
      }

      // Sentuh updatedAt row agar "last modified" mencerminkan edit ini
      await tx.row.update({
        where: { id: rowId },
        data: { updatedAt: new Date() },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Row',
          entityId: rowId,
          action: ChangeAction.UPDATE,
          afterData: { sheetId, changedColumns: dto.cells.map((c) => c.columnId) },
        },
      });
    });

    // 6. Re-fetch cell setelah transaksi → bangun respons konsisten (bentuk sama dengan 3d/3e)
    const updatedCells = await this.prisma.cell.findMany({
      where: { rowId },
      select: { columnId: true, value: true },
    });

    const cells: Record<string, string | null> = {};
    for (const colId of allColumnIds) {
      cells[colId] = null;
    }
    for (const cell of updatedCells) {
      cells[cell.columnId] = cell.value ?? null;
    }

    return { rowId, orderIndex: row.orderIndex, cells };
  }

  async deleteRow(sheetId: string, rowId: string, userId: string) {
    // 1. Sheet ada dan bisa ditulis?
    await this.assertWritableSheet(sheetId);

    // 2. Row ada DAN milik sheet ini? (cegah hapus baris sheet lain via path palsu)
    const row = await this.prisma.row.findUnique({
      where: { id: rowId },
      select: { id: true, orderIndex: true, sheetId: true },
    });
    if (!row || row.sheetId !== sheetId) {
      throw new NotFoundException('Baris tidak ditemukan');
    }

    // 3. Snapshot sel sebelum dihapus — disimpan di ChangeLog.beforeData
    const cellsSnapshot = await this.prisma.cell.findMany({
      where: { rowId },
      select: { columnId: true, value: true },
    });

    // 4. Transaksi: audit dulu, baru hapus Row
    // Cell.rowId punya onDelete: Cascade → cukup delete Row; sel ikut terhapus otomatis.
    await this.prisma.$transaction(async (tx) => {
      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Row',
          entityId: rowId,
          action: ChangeAction.DELETE,
          beforeData: {
            sheetId,
            orderIndex: row.orderIndex,
            cells: cellsSnapshot,
          },
        },
      });

      await tx.row.delete({ where: { id: rowId } });
    });

    return { deleted: true, rowId };
  }

  async getColumnValues(sheetId: string, columnId: string) {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');

    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { sheetId: true, _count: { select: { childColumns: true } } },
    });
    if (!column || column.sheetId !== sheetId) {
      throw new NotFoundException('Kolom tidak ditemukan di sheet ini');
    }
    if (column._count.childColumns > 0) {
      throw new BadRequestException('Kolom grup tidak memiliki nilai; gunakan kolom daun (leaf).');
    }

    const LIMIT = 200;
    // groupBy menghasilkan GROUP BY di SQL — distinct dijamin di DB, bukan di memori.
    const groups = await this.prisma.cell.groupBy({
      by: ['value'],
      where: {
        columnId,
        value: { not: null },
      },
      orderBy: { value: 'asc' },
      take: LIMIT,
    });

    const values = (groups as { value: string | null }[])
      .map((g) => g.value as string)
      .filter((v) => v !== null && v.trim() !== '');

    return { values, total: values.length };
  }

  async findById(id: string) {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        orderIndex: true,
        isReadOnly: true,
        menuItem: { select: { id: true, name: true } },
      },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');

    if (!sheet.isReadOnly) return sheet;

    // Grid-mirror: sertakan merges (koordinat relatif, selaras orderIndex).
    const merges = await this.prisma.cellMerge.findMany({
      where: { sheetId: id },
      select: { startRow: true, endRow: true, startCol: true, endCol: true },
      orderBy: [{ startRow: 'asc' }, { startCol: 'asc' }],
    });

    return { ...sheet, merges };
  }
}
