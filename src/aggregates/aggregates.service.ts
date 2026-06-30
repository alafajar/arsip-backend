import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AggregateOp, ColumnType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAggregateDto } from './dto/create-aggregate.dto';

// Operasi yang hanya valid untuk kolom numerik (INTEGER atau FLOAT).
const NUMERIC_OPS = new Set<AggregateOp>([
  AggregateOp.SUM,
  AggregateOp.AVERAGE,
  AggregateOp.MAX,
  AggregateOp.MIN,
]);

const NUMERIC_TYPES = new Set<ColumnType>([ColumnType.INTEGER, ColumnType.FLOAT]);

function toNum(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? null : n;
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(10)).toString();
}

export function computeVerticalAggregate(
  op: AggregateOp,
  cellValues: (string | null)[],
): string {
  switch (op) {
    case AggregateOp.COUNT:
      // Hitung sel non-kosong (bukan hanya numerik)
      return String(cellValues.filter((v) => v !== null && v.trim() !== '').length);
    case AggregateOp.SUM: {
      const nums = cellValues.map(toNum).filter((n): n is number => n !== null);
      return nums.length === 0 ? '' : fmt(nums.reduce((a, b) => a + b, 0));
    }
    case AggregateOp.AVERAGE: {
      const nums = cellValues.map(toNum).filter((n): n is number => n !== null);
      return nums.length === 0 ? '' : fmt(nums.reduce((a, b) => a + b, 0) / nums.length);
    }
    case AggregateOp.MAX: {
      const nums = cellValues.map(toNum).filter((n): n is number => n !== null);
      return nums.length === 0 ? '' : fmt(Math.max(...nums));
    }
    case AggregateOp.MIN: {
      const nums = cellValues.map(toNum).filter((n): n is number => n !== null);
      return nums.length === 0 ? '' : fmt(Math.min(...nums));
    }
  }
}

@Injectable()
export class AggregatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWritableSheet(sheetId: string): Promise<void> {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true, isReadOnly: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');
    if (sheet.isReadOnly) throw new ConflictException('Sheet ini hanya-baca dan tidak bisa diubah');
  }

  async createAggregate(sheetId: string, dto: CreateAggregateDto) {
    await this.assertWritableSheet(sheetId);

    // Validasi kolom: ada, milik sheet ini, dan merupakan kolom daun
    const column = await this.prisma.column.findUnique({
      where: { id: dto.targetColumnId },
      select: {
        id: true,
        sheetId: true,
        type: true,
        _count: { select: { childColumns: true } },
      },
    });
    if (!column || column.sheetId !== sheetId) {
      throw new NotFoundException('Kolom tidak ditemukan di sheet ini');
    }
    if (column._count.childColumns > 0) {
      throw new BadRequestException(
        'Kolom grup tidak bisa diagregasi; gunakan kolom daun (leaf).',
      );
    }

    // Operasi numerik hanya untuk kolom INTEGER atau FLOAT
    if (NUMERIC_OPS.has(dto.op) && !NUMERIC_TYPES.has(column.type)) {
      throw new BadRequestException(
        `Operasi ${dto.op} hanya valid untuk kolom bertipe INTEGER atau FLOAT; ` +
          `kolom ini bertipe ${column.type}.`,
      );
    }

    // Simpan — unique constraint (sheetId, targetColumnId, op) menolak duplikat
    try {
      const aggregate = await this.prisma.sheetAggregate.create({
        data: { sheetId, targetColumnId: dto.targetColumnId, op: dto.op },
        select: { id: true, sheetId: true, targetColumnId: true, op: true },
      });
      return aggregate;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'P2002') {
        throw new ConflictException(
          `Agregat ${dto.op} untuk kolom ini sudah ada.`,
        );
      }
      throw err;
    }
  }

  async deleteAggregate(sheetId: string, aggregateId: string) {
    await this.assertWritableSheet(sheetId);

    const aggregate = await this.prisma.sheetAggregate.findUnique({
      where: { id: aggregateId },
      select: { id: true, sheetId: true },
    });
    if (!aggregate || aggregate.sheetId !== sheetId) {
      throw new NotFoundException('Agregat tidak ditemukan di sheet ini');
    }

    await this.prisma.sheetAggregate.delete({ where: { id: aggregateId } });
    return { deleted: true, aggregateId };
  }

  async getAggregates(sheetId: string) {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');

    const definitions = await this.prisma.sheetAggregate.findMany({
      where: { sheetId },
      select: { id: true, targetColumnId: true, op: true },
      orderBy: [{ targetColumnId: 'asc' }, { op: 'asc' }],
    });

    if (definitions.length === 0) return { aggregates: [] };

    // Kumpulkan semua columnId unik yang perlu diambil nilainya
    const uniqueColumnIds = [...new Set(definitions.map((d) => d.targetColumnId))];

    // Satu query per kolom unik — ambil semua nilai (seluruh baris, bukan hanya halaman aktif)
    const cellsByColumn = new Map<string, (string | null)[]>();
    await Promise.all(
      uniqueColumnIds.map(async (columnId) => {
        const cells = await this.prisma.cell.findMany({
          where: { columnId },
          select: { value: true },
          orderBy: { rowId: 'asc' },
        });
        cellsByColumn.set(
          columnId,
          cells.map((c) => c.value ?? null),
        );
      }),
    );

    const aggregates = definitions.map((def) => ({
      id: def.id,
      columnId: def.targetColumnId,
      op: def.op,
      value: computeVerticalAggregate(def.op, cellsByColumn.get(def.targetColumnId) ?? []),
    }));

    return { aggregates };
  }
}
