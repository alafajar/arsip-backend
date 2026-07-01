import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { SheetsService } from './sheets.service';
import { CreateRowDto } from './dto/create-row.dto';
import { CreateSheetDto } from './dto/create-sheet.dto';
import { UpdateRowDto } from './dto/update-row.dto';

@ApiTags('Sheets')
@ApiBearerAuth()
@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheetsService: SheetsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat sheet kosong baru (ADMIN)', description: 'Sheet dibuat tanpa kolom dan baris; tambah kolom via endpoint column CRUD.' })
  @ApiResponse({ status: 201, schema: { example: { id: 'uuid', name: 'Data Dosen 2025', menuItemId: 'uuid', isReadOnly: false, orderIndex: 1 } } })
  @ApiResponse({ status: 400, description: 'Validasi gagal.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Menu item tidak ditemukan.' })
  createSheet(
    @Body() dto: CreateSheetDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.createSheet(dto, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadata sheet (nama, menu, dll.)' })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({ status: 200, schema: { example: { id: 'uuid', name: '16, 17, 18, 19 Data Dosen Tetap', isReadOnly: false, menuItem: { id: 'uuid', name: 'Test Import' } } } })
  @ApiResponse({ status: 404, description: 'Sheet tidak ditemukan.' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sheetsService.findById(id);
  }

  @Get(':id/columns')
  @ApiOperation({
    summary: 'Pohon kolom sheet',
    description:
      'Mengembalikan array root ColumnNode; tiap node punya `children`. ' +
      'Leaf node (children=[]) adalah kolom data. `orderIndex` unik antar-sibling, bukan global. ' +
      'Kolom formula horizontal ditandai lewat `formulaOp` (bukan `null`) dan `formulaOperandIds` ' +
      '(daftar UUID operand); kolom biasa selalu `formulaOp: null, formulaOperandIds: []`.',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        { id: 'uuid-no', name: 'No.', type: 'INTEGER', orderIndex: 1, formulaOp: null, formulaOperandIds: [], children: [] },
        { id: 'uuid-nama', name: 'Nama Dosen', type: 'TEXT', orderIndex: 2, formulaOp: null, formulaOperandIds: [], children: [] },
        { id: 'uuid-kual', name: 'Kualifikasi Akademik Terakhir', type: 'TEXT', orderIndex: 3, formulaOp: null, formulaOperandIds: [], children: [
          { id: 'uuid-mag', name: 'Magister', type: 'TEXT', orderIndex: 1, formulaOp: null, formulaOperandIds: [], children: [] },
          { id: 'uuid-dok', name: 'Doktor', type: 'TEXT', orderIndex: 2, formulaOp: null, formulaOperandIds: [], children: [] },
        ]},
        { id: 'uuid-jab', name: 'Jabatan Akademik', type: 'TEXT', orderIndex: 4, formulaOp: null, formulaOperandIds: [], children: [] },
        { id: 'uuid-nidn', name: 'NIDN', type: 'TEXT', orderIndex: 5, formulaOp: null, formulaOperandIds: [], children: [] },
        { id: 'uuid-link', name: 'Link Dokumen', type: 'URL', orderIndex: 6, formulaOp: null, formulaOperandIds: [], children: [] },
        { id: 'uuid-total', name: 'Total', type: 'INTEGER', orderIndex: 7, formulaOp: 'ADD', formulaOperandIds: ['uuid-no', 'uuid-nidn'], children: [] },
      ],
    },
  })
  getColumns(@Param('id', ParseUUIDPipe) id: string) {
    return this.sheetsService.getColumns(id);
  }

  @Get(':id/rows')
  @ApiOperation({
    summary: 'Daftar baris (paginasi)',
    description:
      '`cells` adalah object `{ [columnId]: value | null }`. ' +
      'Gunakan `columnId` dari `/columns` untuk memetakan kolom ke nilai.',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiQuery({ name: 'limit', required: false, example: 50, description: 'Maks baris per halaman (1–200, default 50)' })
  @ApiQuery({ name: 'offset', required: false, example: 0, description: 'Baris dilewati (default 0)' })
  @ApiQuery({
    name: 'filter',
    required: false,
    description:
      'Filter faceted. Format bracket-array qs: `filter[<columnId>][]=v1&filter[<columnId>][]=v2`. ' +
      'OR dalam satu kolom, AND antar-kolom. Exact match (K2).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        rows: [
          {
            rowId: 'uuid',
            orderIndex: 1,
            cells: {
              'uuid-no': '1',
              'uuid-nama': 'Anas Puji Santoso, Ir., M.T.',
              'uuid-mag': 'Teknik Perminyakan',
              'uuid-dok': '-',
              'uuid-jab': 'Lektor',
              'uuid-nidn': '0017026012',
              'uuid-link': 'https://drive.google.com/...',
            },
          },
        ],
        total: 25,
        limit: 50,
        offset: 0,
      },
    },
  })
  getRows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('filter') rawFilter?: Record<string, unknown>,
  ) {
    return this.sheetsService.getRows(id, limit, offset, rawFilter);
  }

  @Get(':id/columns/:columnId/values')
  @ApiOperation({
    summary: 'Nilai unik pada kolom (untuk filter multi-select)',
    description:
      'Mengembalikan nilai distinct non-kosong pada kolom daun, terurut naik, maks 200 nilai. ' +
      'Kolom grup (punya anak) akan ditolak dengan 400.',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiParam({ name: 'columnId', description: 'UUID kolom daun' })
  @ApiResponse({
    status: 200,
    schema: { example: { values: ['Lektor', 'Lektor Kepala', 'Profesor'], total: 3 } },
  })
  @ApiResponse({ status: 400, description: 'Kolom adalah grup, bukan daun.' })
  @ApiResponse({ status: 404, description: 'Sheet atau kolom tidak ditemukan.' })
  getColumnValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
  ) {
    return this.sheetsService.getColumnValues(id, columnId);
  }

  @Post(':id/rows')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tambah baris baru (ADMIN)', description: 'Sertakan hanya sel yang punya nilai; kolom lain otomatis null.' })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({ status: 201, description: 'Baris berhasil dibuat.', schema: { example: { rowId: 'uuid', orderIndex: 26, cells: {} } } })
  @ApiResponse({ status: 400, description: 'Validasi gagal atau sheet read-only.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  createRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRowDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.createRow(id, dto, req.user.id);
  }

  @Patch(':id/rows/:rowId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update sel dalam baris (ADMIN)', description: 'Hanya kolom yang disertakan yang berubah; kolom lain tidak tersentuh.' })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiParam({ name: 'rowId', description: 'UUID baris' })
  @ApiResponse({ status: 200, description: 'Baris berhasil diupdate.' })
  @ApiResponse({ status: 404, description: 'Sheet atau baris tidak ditemukan.' })
  updateRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpdateRowDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.updateRow(id, rowId, dto, req.user.id);
  }

  @Delete(':id/rows/:rowId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hapus baris (ADMIN)' })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiParam({ name: 'rowId', description: 'UUID baris' })
  @ApiResponse({ status: 200, description: 'Baris berhasil dihapus.' })
  @ApiResponse({ status: 404, description: 'Sheet atau baris tidak ditemukan.' })
  deleteRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.deleteRow(id, rowId, req.user.id);
  }
}
