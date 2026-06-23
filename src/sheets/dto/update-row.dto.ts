import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CellPatchDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'UUID kolom (leaf)' })
  @Matches(UUID_RE, { message: 'columnId harus berformat UUID' })
  columnId!: string;

  @ApiPropertyOptional({ example: 'Lektor Kepala', nullable: true, description: 'null / string kosong / whitespace → hapus nilai sel; string → set/update' })
  @IsOptional()
  @IsString()
  value?: string | null;
}

export class UpdateRowDto {
  @ApiProperty({ type: [CellPatchDto], description: 'Hanya kolom yang disertakan yang diubah; kolom lain tidak tersentuh' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellPatchDto)
  cells!: CellPatchDto[];
}
