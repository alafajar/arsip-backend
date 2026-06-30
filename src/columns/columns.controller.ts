import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@ApiTags('Columns')
@ApiBearerAuth()
@Controller()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post('sheets/:id/columns')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tambah kolom baru ke sheet (ADMIN)',
    description: 'Buat kolom daun atau kolom grup (punya parentColumnId). Tipe tidak bisa diubah setelah dibuat.',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({ status: 201, schema: { example: { id: 'uuid', sheetId: 'uuid', name: 'Jabatan Akademik', type: 'TEXT', orderIndex: 5, parentColumnId: null } } })
  @ApiResponse({ status: 400, description: 'Validasi gagal atau tipe tak dikenal.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Sheet atau parentColumnId tidak ditemukan.' })
  @ApiResponse({ status: 409, description: 'Sheet hanya-baca.' })
  createColumn(
    @Param('id', ParseUUIDPipe) sheetId: string,
    @Body() dto: CreateColumnDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.columnsService.createColumn(sheetId, dto, req.user.id);
  }

  @Patch('columns/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Ubah nama atau urutan kolom (ADMIN)',
    description: 'Hanya name dan orderIndex yang dapat diubah. Tipe kolom tidak dapat diubah di sini.',
  })
  @ApiParam({ name: 'id', description: 'UUID kolom' })
  @ApiResponse({ status: 200, schema: { example: { id: 'uuid', sheetId: 'uuid', name: 'Nama Baru', type: 'TEXT', orderIndex: 3, parentColumnId: null } } })
  @ApiResponse({ status: 400, description: 'Validasi gagal atau tidak ada field yang diubah.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Kolom tidak ditemukan.' })
  @ApiResponse({ status: 409, description: 'Sheet hanya-baca.' })
  updateColumn(
    @Param('id', ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateColumnDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.columnsService.updateColumn(columnId, dto, req.user.id);
  }

  @Delete('columns/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Hapus kolom beserta cell-nya (ADMIN)',
    description:
      'Kolom daun: hapus kolom + seluruh Cell dalam satu transaksi. ' +
      'Kolom grup yang masih punya anak: ditolak (400) — hapus anak terlebih dahulu.',
  })
  @ApiParam({ name: 'id', description: 'UUID kolom' })
  @ApiResponse({ status: 200, schema: { example: { deleted: true, columnId: 'uuid' } } })
  @ApiResponse({ status: 400, description: 'Kolom grup masih punya anak.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Kolom tidak ditemukan.' })
  @ApiResponse({ status: 409, description: 'Sheet hanya-baca.' })
  deleteColumn(
    @Param('id', ParseUUIDPipe) columnId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.columnsService.deleteColumn(columnId, req.user.id);
  }
}
