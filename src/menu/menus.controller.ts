import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@ApiTags('Menus')
@ApiBearerAuth()
@Controller('menus')
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @ApiOperation({ summary: 'Ambil pohon menu lengkap', description: 'Mengembalikan array bertingkat: setiap node bisa punya `children` dan daftar `sheets`.' })
  @ApiResponse({ status: 200, description: 'Pohon menu.' })
  getTree() {
    return this.menusService.getTree();
  }

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat menu baru (ADMIN)', description: '`parentId` opsional; jika kosong → top-level.' })
  @ApiResponse({ status: 201, description: 'Menu berhasil dibuat.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  create(
    @Body() dto: CreateMenuDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update nama / pindah parent menu (ADMIN)' })
  @ApiParam({ name: 'id', description: 'UUID menu' })
  @ApiResponse({ status: 200, description: 'Menu berhasil diupdate.' })
  @ApiResponse({ status: 404, description: 'Menu tidak ditemukan.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hapus menu beserta seluruh turunannya (ADMIN)' })
  @ApiParam({ name: 'id', description: 'UUID menu' })
  @ApiResponse({ status: 200, description: 'Menu berhasil dihapus.' })
  @ApiResponse({ status: 404, description: 'Menu tidak ditemukan.' })
  deleteNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.menusService.delete(id, req.user.id);
  }
}
