import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeAction, ColumnType } from '../../generated/prisma/client';
import { FormulaOp } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

// Operasi yang membutuhkan operand bertipe numerik (INTEGER/FLOAT).
// COUNT dikecualikan: menghitung entri valid, bukan menjumlahkan nilainya.
const NUMERIC_OPS = new Set<FormulaOp>([
  FormulaOp.ADD, FormulaOp.SUB, FormulaOp.MUL, FormulaOp.DIV,
  FormulaOp.SUM, FormulaOp.AVERAGE, FormulaOp.MAX, FormulaOp.MIN,
]);

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertWritableSheet(sheetId: string): Promise<void> {
    const sheet = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: { id: true, isReadOnly: true },
    });
    if (!sheet) throw new NotFoundException('Sheet tidak ditemukan');
    if (sheet.isReadOnly) throw new ConflictException('Sheet ini hanya-baca dan tidak bisa diubah');
  }

  /**
   * Validasi definisi formula sebelum disimpan.
   * @param sheetId Sheet tempat kolom formula berada.
   * @param selfColumnId ID kolom yang sedang dibuat/diupdate (null saat CREATE — ID belum ada).
   * @param op Operasi formula.
   * @param operandIds Daftar columnId sumber.
   */
  private async validateFormulaDefinition(
    sheetId: string,
    selfColumnId: string | null,
    op: FormulaOp,
    operandIds: string[],
  ): Promise<void> {
    // 1. Tidak boleh kosong
    if (operandIds.length === 0) {
      throw new BadRequestException('formulaOperandIds tidak boleh kosong');
    }

    // 2. SUB/DIV membutuhkan ≥ 2 operand (pairwise kiri→kanan)
    if ((op === FormulaOp.SUB || op === FormulaOp.DIV) && operandIds.length < 2) {
      throw new BadRequestException(`Operasi ${op} membutuhkan minimal 2 operand`);
    }

    // 3. Self-reference (hanya relevan saat UPDATE, karena saat CREATE ID belum ada)
    if (selfColumnId && operandIds.includes(selfColumnId)) {
      throw new BadRequestException('Kolom formula tidak boleh mereferensikan diri sendiri (self-reference)');
    }

    // Fetch semua kolom sheet sekaligus — satu query untuk validasi operand + tipe + siklus
    const allCols = await this.prisma.column.findMany({
      where: { sheetId },
      select: { id: true, name: true, type: true, formulaOp: true, formulaOperandIds: true },
    });
    const colMap = new Map(allCols.map((c) => [c.id, c]));

    // 4. Setiap operandId harus ada dan milik sheet ini
    for (const oid of operandIds) {
      if (!colMap.has(oid)) {
        throw new BadRequestException(`operandId "${oid}" tidak ditemukan di sheet ini`);
      }
    }

    // 5. Tipe numerik (kecuali COUNT)
    if (NUMERIC_OPS.has(op)) {
      const numericTypes = new Set<ColumnType>([ColumnType.INTEGER, ColumnType.FLOAT]);
      for (const oid of operandIds) {
        const col = colMap.get(oid)!;
        if (!numericTypes.has(col.type)) {
          throw new BadRequestException(
            `Operand "${col.name}" bertipe ${col.type} — operasi ${op} hanya mendukung kolom INTEGER atau FLOAT`,
          );
        }
      }
    }

    // 6. Deteksi siklus (hanya relevan saat UPDATE — saat CREATE column belum di graph)
    if (selfColumnId) {
      // Bangun graph formula dari kolom yang sudah ada, pakai definisi baru untuk selfColumnId
      const formulaGraph = new Map<string, string[]>();
      for (const col of allCols) {
        if (col.formulaOp !== null && col.id !== selfColumnId) {
          formulaGraph.set(col.id, col.formulaOperandIds);
        }
      }
      formulaGraph.set(selfColumnId, operandIds);

      // DFS iteratif: cari apakah selfColumnId dapat dijangkau dari operandIds
      const visited = new Set<string>();
      const stack = [...operandIds];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        if (curr === selfColumnId) {
          throw new BadRequestException('Terdeteksi siklus dalam definisi formula (A→…→A)');
        }
        if (visited.has(curr)) continue;
        visited.add(curr);
        const children = formulaGraph.get(curr);
        if (children) stack.push(...children);
      }
    }
  }

  async createColumn(sheetId: string, dto: CreateColumnDto, userId: string) {
    await this.assertWritableSheet(sheetId);

    if (dto.parentColumnId) {
      const parent = await this.prisma.column.findUnique({
        where: { id: dto.parentColumnId },
        select: { id: true, sheetId: true },
      });
      if (!parent || parent.sheetId !== sheetId) {
        throw new NotFoundException('parentColumnId tidak ditemukan di sheet ini');
      }
    }

    // Validasi formula bila formulaOp diberikan
    if (dto.formulaOp !== undefined) {
      await this.validateFormulaDefinition(
        sheetId,
        null, // CREATE: ID belum ada, self-reference dan siklus melalui self tidak mungkin
        dto.formulaOp,
        dto.formulaOperandIds ?? [],
      );
    }

    const column = await this.prisma.$transaction(async (tx) => {
      const last = await tx.column.findFirst({
        where: { sheetId, parentColumnId: dto.parentColumnId ?? null },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      const orderIndex = dto.orderIndex ?? (last?.orderIndex ?? 0) + 1;

      const created = await tx.column.create({
        data: {
          sheetId,
          name: dto.name,
          type: dto.type,
          orderIndex,
          parentColumnId: dto.parentColumnId ?? null,
          ...(dto.formulaOp !== undefined && { formulaOp: dto.formulaOp }),
          ...(dto.formulaOperandIds !== undefined && { formulaOperandIds: dto.formulaOperandIds }),
        },
        select: {
          id: true, sheetId: true, name: true, type: true,
          orderIndex: true, parentColumnId: true, formulaOp: true, formulaOperandIds: true,
        },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Column',
          entityId: created.id,
          action: ChangeAction.CREATE,
          afterData: {
            name: dto.name, type: dto.type, orderIndex,
            parentColumnId: dto.parentColumnId ?? null,
            formulaOp: dto.formulaOp ?? null,
            formulaOperandIds: dto.formulaOperandIds ?? [],
          },
        },
      });

      return created;
    });

    return column;
  }

  async updateColumn(columnId: string, dto: UpdateColumnDto, userId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { id: true, sheetId: true, name: true, orderIndex: true, formulaOp: true },
    });
    if (!column) throw new NotFoundException('Kolom tidak ditemukan');

    await this.assertWritableSheet(column.sheetId);

    const hasNameOrOrder = dto.name !== undefined || dto.orderIndex !== undefined;
    const hasFormula = dto.formulaOp !== undefined;
    if (!hasNameOrOrder && !hasFormula) {
      throw new BadRequestException('Sertakan minimal satu field yang diubah');
    }

    // Bila formulaOp diupdate, wajib sertakan formulaOperandIds dan validasi
    if (hasFormula) {
      if (!dto.formulaOperandIds || dto.formulaOperandIds.length === 0) {
        throw new BadRequestException('formulaOperandIds wajib diisi bila formulaOp diberikan');
      }
      await this.validateFormulaDefinition(
        column.sheetId,
        columnId,
        dto.formulaOp!,
        dto.formulaOperandIds,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.column.update({
        where: { id: columnId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
          ...(dto.formulaOp !== undefined && { formulaOp: dto.formulaOp }),
          ...(dto.formulaOperandIds !== undefined && { formulaOperandIds: dto.formulaOperandIds }),
        },
        select: {
          id: true, sheetId: true, name: true, type: true,
          orderIndex: true, parentColumnId: true, formulaOp: true, formulaOperandIds: true,
        },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Column',
          entityId: columnId,
          action: ChangeAction.UPDATE,
          beforeData: { name: column.name, orderIndex: column.orderIndex, formulaOp: column.formulaOp },
          afterData: { name: result.name, orderIndex: result.orderIndex, formulaOp: result.formulaOp },
        },
      });

      return result;
    });

    return updated;
  }

  async deleteColumn(columnId: string, userId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: {
        id: true, sheetId: true, name: true, type: true,
        orderIndex: true, parentColumnId: true,
        _count: { select: { childColumns: true } },
      },
    });
    if (!column) throw new NotFoundException('Kolom tidak ditemukan');

    await this.assertWritableSheet(column.sheetId);

    if (column._count.childColumns > 0) {
      throw new BadRequestException(
        `Kolom "${column.name}" masih punya ${column._count.childColumns} kolom anak. Hapus anak terlebih dahulu.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Column',
          entityId: columnId,
          action: ChangeAction.DELETE,
          beforeData: {
            name: column.name, type: column.type, orderIndex: column.orderIndex,
            parentColumnId: column.parentColumnId, sheetId: column.sheetId,
          },
        },
      });

      await tx.column.delete({ where: { id: columnId } });
    });

    return { deleted: true, columnId };
  }
}
