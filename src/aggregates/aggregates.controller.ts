import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { AggregatesService } from './aggregates.service';
import { CreateAggregateDto } from './dto/create-aggregate.dto';

@ApiTags('Aggregates')
@ApiBearerAuth()
@Controller('sheets/:id/aggregates')
export class AggregatesController {
  constructor(private readonly aggregatesService: AggregatesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Buat definisi agregat kolom (ADMIN)',
    description:
      'Simpan aturan agregat: kolom + operasi. Nilai dihitung saat GET, bukan disimpan. ' +
      'Op numerik (SUM/AVERAGE/MAX/MIN) hanya valid untuk kolom INTEGER/FLOAT.',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({
    status: 201,
    schema: { example: { id: 'uuid', sheetId: 'uuid', targetColumnId: 'uuid', op: 'SUM' } },
  })
  @ApiResponse({ status: 400, description: 'Validasi gagal atau kolom bukan numerik.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Sheet atau kolom tidak ditemukan.' })
  @ApiResponse({ status: 409, description: 'Sheet hanya-baca atau agregat sudah ada.' })
  createAggregate(
    @Param('id', ParseUUIDPipe) sheetId: string,
    @Body() dto: CreateAggregateDto,
  ) {
    return this.aggregatesService.createAggregate(sheetId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Daftar agregat sheet beserta nilai saat ini',
    description: 'Nilai dihitung dari seluruh baris (bukan hanya halaman aktif).',
  })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        aggregates: [
          { id: 'uuid', columnId: 'uuid-jumlah', op: 'SUM', value: '42' },
          { id: 'uuid', columnId: 'uuid-nama', op: 'COUNT', value: '25' },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Sheet tidak ditemukan.' })
  getAggregates(@Param('id', ParseUUIDPipe) sheetId: string) {
    return this.aggregatesService.getAggregates(sheetId);
  }

  @Delete(':aggregateId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hapus definisi agregat (ADMIN)' })
  @ApiParam({ name: 'id', description: 'UUID sheet' })
  @ApiParam({ name: 'aggregateId', description: 'UUID agregat' })
  @ApiResponse({ status: 200, schema: { example: { deleted: true, aggregateId: 'uuid' } } })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @ApiResponse({ status: 404, description: 'Agregat tidak ditemukan.' })
  @ApiResponse({ status: 409, description: 'Sheet hanya-baca.' })
  deleteAggregate(
    @Param('id', ParseUUIDPipe) sheetId: string,
    @Param('aggregateId', ParseUUIDPipe) aggregateId: string,
  ) {
    return this.aggregatesService.deleteAggregate(sheetId, aggregateId);
  }
}
