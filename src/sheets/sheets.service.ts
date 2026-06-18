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
