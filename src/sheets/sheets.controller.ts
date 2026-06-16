import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SheetsService } from './sheets.service';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheetsService: SheetsService) {}

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sheetsService.findById(id);
  }
}
