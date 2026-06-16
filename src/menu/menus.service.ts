import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MenuNode = {
  id: string;
  name: string;
  orderIndex: number;
  children: MenuNode[];
};

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<MenuNode[]> {
    const items = await this.prisma.menuItem.findMany({
      orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    });

    // O(n) tree-building di memori: cukup untuk skala menu (puluhan node).
    // Trade-off: seluruh tabel dimuat sekaligus; tidak cocok untuk pohon raksasa.
    const map = new Map<string, MenuNode>();
    for (const item of items) {
      map.set(item.id, {
        id: item.id,
        name: item.name,
        orderIndex: item.orderIndex,
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
}
