import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'Jabatan Akademik Baru', description: 'Nama baru kolom' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh string kosong' })
  name?: string;

  @ApiPropertyOptional({ example: 3, description: 'Urutan baru antar sibling' })
  @IsOptional()
  @IsInt({ message: 'orderIndex harus bilangan bulat' })
  @Min(1, { message: 'orderIndex minimal 1' })
  orderIndex?: number;
}
