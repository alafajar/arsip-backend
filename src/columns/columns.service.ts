import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeAction } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

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

  async createColumn(sheetId: string, dto: CreateColumnDto, userId: string) {
    await this.assertWritableSheet(sheetId);

    // Validasi parentColumnId: harus ada, milik sheet ini, dan merupakan grup (tidak punya type=leaf requirement — semua bisa jadi grup)
    if (dto.parentColumnId) {
      const parent = await this.prisma.column.findUnique({
        where: { id: dto.parentColumnId },
        select: { id: true, sheetId: true },
      });
      if (!parent || parent.sheetId !== sheetId) {
        throw new NotFoundException('parentColumnId tidak ditemukan di sheet ini');
      }
    }

    const column = await this.prisma.$transaction(async (tx) => {
      // orderIndex = max+1 antar sibling (same parent + same sheet)
      const last = await tx.column.findFirst({
        where: {
          sheetId,
          parentColumnId: dto.parentColumnId ?? null,
        },
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
        },
        select: { id: true, sheetId: true, name: true, type: true, orderIndex: true, parentColumnId: true },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Column',
          entityId: created.id,
          action: ChangeAction.CREATE,
          afterData: { name: dto.name, type: dto.type, orderIndex, parentColumnId: dto.parentColumnId ?? null },
        },
      });

      return created;
    });

    return column;
  }

  async updateColumn(columnId: string, dto: UpdateColumnDto, userId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      select: { id: true, sheetId: true, name: true, orderIndex: true },
    });
    if (!column) throw new NotFoundException('Kolom tidak ditemukan');

    await this.assertWritableSheet(column.sheetId);

    if (!dto.name && dto.orderIndex === undefined) {
      throw new BadRequestException('Sertakan minimal satu field: name atau orderIndex');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.column.update({
        where: { id: columnId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
        },
        select: { id: true, sheetId: true, name: true, type: true, orderIndex: true, parentColumnId: true },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'Column',
          entityId: columnId,
          action: ChangeAction.UPDATE,
          beforeData: { name: column.name, orderIndex: column.orderIndex },
          afterData: { name: result.name, orderIndex: result.orderIndex },
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
        id: true,
        sheetId: true,
        name: true,
        type: true,
        orderIndex: true,
        parentColumnId: true,
        _count: { select: { childColumns: true } },
      },
    });
    if (!column) throw new NotFoundException('Kolom tidak ditemukan');

    await this.assertWritableSheet(column.sheetId);

    // Tolak penghapusan kolom grup yang masih punya anak — admin harus hapus anak dulu.
    // Pilihan ini lebih aman dari cascade: mencegah penghapusan tidak sengaja pada header bertingkat.
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
            name: column.name,
            type: column.type,
            orderIndex: column.orderIndex,
            parentColumnId: column.parentColumnId,
            sheetId: column.sheetId,
          },
        },
      });

      // Cell.columnId punya onDelete: Cascade di schema → cukup delete Column; cell ikut terhapus.
      await tx.column.delete({ where: { id: columnId } });
    });

    return { deleted: true, columnId };
  }
}
