import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateMenuDto {
  @ApiProperty({ example: 'Data Dosen Tetap' })
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong' })
  name!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'UUID parent menu; kosongkan untuk top-level' })
  @IsOptional()
  @Matches(UUID_RE, { message: 'parentId harus berformat UUID' })
  parentId?: string;
}
