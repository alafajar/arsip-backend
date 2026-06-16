import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SheetsService {
  constructor(private readonly prisma: PrismaService) {}

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
