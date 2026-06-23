import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateMenuDto {
  @ApiPropertyOptional({ example: 'Data Dosen Tetap' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong jika disertakan' })
  name?: string;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'null = pindah ke top-level; UUID = pindah ke parent baru; omit = tidak berubah' })
  @IsOptional()
  @Matches(UUID_RE, { message: 'parentId harus berformat UUID jika diisi' })
  parentId?: string | null;
}
