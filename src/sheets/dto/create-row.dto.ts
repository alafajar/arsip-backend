import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Regex permisif: hanya cek format 8-4-4-4-12 hex — tidak cek version/variant.
// ParseUUIDPipe di NestJS pakai pola serupa; seed memakai sentinel UUID yang
// byte variant-nya 0x00 (bukan 8/9/A/B RFC 4122), sehingga @IsUUID() menolaknya.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CellInputDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'UUID kolom (leaf, bukan grup)' })
  @Matches(UUID_RE, { message: 'columnId harus berformat UUID' })
  columnId!: string;

  @ApiPropertyOptional({ example: 'Teknik Perminyakan', nullable: true, description: 'null atau kosong = sel kosong' })
  @IsOptional()
  @IsString()
  value?: string | null;
}

export class CreateRowDto {
  @ApiProperty({ type: [CellInputDto], description: 'Daftar nilai sel untuk baris baru; kolom yang tidak disertakan akan kosong' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CellInputDto)
  cells!: CellInputDto[];
}
