import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CellPatchDto {
  @Matches(UUID_RE, { message: 'columnId harus berformat UUID' })
  columnId!: string;

  // null / "" / whitespace → kosongkan sel (hapus Cell); string non-kosong → set/update
  @IsOptional()
  @IsString()
  value?: string | null;
}

export class UpdateRowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellPatchDto)
  cells!: CellPatchDto[];
}
