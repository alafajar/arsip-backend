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
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { SheetsService } from './sheets.service';
import { CreateRowDto } from './dto/create-row.dto';
import { UpdateRowDto } from './dto/update-row.dto';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheetsService: SheetsService) {}

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sheetsService.findById(id);
  }

  @Get(':id/columns')
  getColumns(@Param('id', ParseUUIDPipe) id: string) {
    return this.sheetsService.getColumns(id);
  }

  @Post(':id/rows')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRowDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.createRow(id, dto, req.user.id);
  }

  @Delete(':id/rows/:rowId')
  @Roles(Role.ADMIN)
  deleteRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.deleteRow(id, rowId, req.user.id);
  }

  @Patch(':id/rows/:rowId')
  @Roles(Role.ADMIN)
  updateRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpdateRowDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.sheetsService.updateRow(id, rowId, dto, req.user.id);
  }

  @Get(':id/rows')
  getRows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.sheetsService.getRows(id, limit, offset);
  }
}
