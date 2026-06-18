import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChangeAction } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

export type MenuNode = {
  id: string;
  name: string;
  orderIndex: number;
  sheets: { id: string; name: string }[];
  children: MenuNode[];
};

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<MenuNode[]> {
    const items = await this.prisma.menuItem.findMany({
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      include: {
        sheets: { select: { id: true, name: true }, orderBy: { orderIndex: 'asc' } },
      },
    });

    // O(n) tree-building di memori: cukup untuk skala menu (puluhan node).
    // Trade-off: seluruh tabel dimuat sekaligus; tidak cocok untuk pohon raksasa.
    const map = new Map<string, MenuNode>();
    for (const item of items) {
      map.set(item.id, {
        id: item.id,
        name: item.name,
        orderIndex: item.orderIndex,
        sheets: item.sheets,
        children: [],
      });
    }

    const roots: MenuNode[] = [];
    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parentId) {
        map.get(item.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async create(dto: CreateMenuDto, userId: string) {
    // Cek parent ada jika disertakan
    if (dto.parentId) {
      const parent = await this.prisma.menuItem.findUnique({
        where: { id: dto.parentId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Node induk tidak ditemukan');
    }

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.menuItem.aggregate({
        where: { parentId: dto.parentId ?? null },
        _max: { orderIndex: true },
      });
      const orderIndex = (agg._max.orderIndex ?? 0) + 1;

      const node = await tx.menuItem.create({
        data: { name: dto.name, parentId: dto.parentId ?? null, orderIndex },
        select: { id: true, name: true, orderIndex: true, parentId: true },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'MenuItem',
          entityId: node.id,
          action: ChangeAction.CREATE,
          afterData: { name: node.name, parentId: node.parentId },
        },
      });

      return node;
    });
  }

  async update(id: string, dto: UpdateMenuDto, userId: string) {
    const node = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, name: true, parentId: true, orderIndex: true },
    });
    if (!node) throw new NotFoundException('Node tidak ditemukan');

    // Jika parentId diubah, cegah siklus
    const newParentId = dto.parentId !== undefined ? dto.parentId : node.parentId;
    if (newParentId !== null && newParentId !== node.parentId) {
      if (newParentId === id) {
        throw new BadRequestException('Node tidak dapat menjadi induk dirinya sendiri.');
      }
      if (await this.wouldCauseCycle(id, newParentId)) {
        throw new BadRequestException('Memindahkan node ke keturunannya sendiri akan membuat siklus.');
      }
      // Pastikan parent baru ada
      const parent = await this.prisma.menuItem.findUnique({
        where: { id: newParentId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Node induk baru tidak ditemukan');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        },
        select: { id: true, name: true, orderIndex: true, parentId: true },
      });

      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'MenuItem',
          entityId: id,
          action: ChangeAction.UPDATE,
          beforeData: { name: node.name, parentId: node.parentId },
          afterData: { name: updated.name, parentId: updated.parentId },
        },
      });

      return updated;
    });
  }

  async delete(id: string, userId: string) {
    const node = await this.prisma.menuItem.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        parentId: true,
        _count: { select: { children: true, sheets: true } },
      },
    });
    if (!node) throw new NotFoundException('Node tidak ditemukan');

    if (node._count.children > 0 || node._count.sheets > 0) {
      throw new ConflictException(
        'Tidak dapat menghapus node yang memiliki anak atau sheet tertaut. Hapus isinya terlebih dahulu.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.changeLog.create({
        data: {
          userId,
          entityType: 'MenuItem',
          entityId: id,
          action: ChangeAction.DELETE,
          beforeData: { name: node.name, parentId: node.parentId },
        },
      });
      await tx.menuItem.delete({ where: { id } });
    });

    return { deleted: true, id };
  }

  // Telusuri ke atas dari `candidateParentId`; kembalikan true jika menyentuh `nodeId`
  private async wouldCauseCycle(nodeId: string, candidateParentId: string): Promise<boolean> {
    let current: string | null = candidateParentId;
    while (current !== null) {
      if (current === nodeId) return true;
      const found: { parentId: string | null } | null =
        await this.prisma.menuItem.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
      current = found?.parentId ?? null;
    }
    return false;
  }
}
