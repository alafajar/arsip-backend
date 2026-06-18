import { Injectable, NotFoundException } from '@nestjs/common';
import { ColumnType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  async findById(id: string) {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        orderIndex: true,
        menuItem: { select: { id: true, name: true } },
      },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');
    return sheet;
  }
}
