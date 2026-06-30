import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateSheetDto {
  @ApiProperty({ example: '00000000-0000-0000-0001-000000000002', description: 'UUID menu item induk' })
  @Matches(UUID_RE, { message: 'menuItemId harus berformat UUID' })
  menuItemId!: string;

  @ApiProperty({ example: 'Data Dosen Tetap 2025', description: 'Nama sheet (non-kosong)' })
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong' })
  name!: string;
}
