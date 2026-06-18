import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

// Regex permisif: hanya cek format 8-4-4-4-12 hex — tidak cek version/variant.
// ParseUUIDPipe di NestJS pakai pola serupa; seed memakai sentinel UUID yang
// byte variant-nya 0x00 (bukan 8/9/A/B RFC 4122), sehingga @IsUUID() menolaknya.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CellInputDto {
  @Matches(UUID_RE, { message: 'columnId harus berformat UUID' })
  columnId!: string;

  @IsOptional()
  @IsString()
  value?: string | null;
}

export class CreateRowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellInputDto)
  cells!: CellInputDto[];
}
