import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FormulaOp } from '../../../generated/prisma/enums';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  @ApiPropertyOptional({ enum: FormulaOp, description: 'Operasi formula baru (wajib disertai formulaOperandIds)' })
  @IsOptional()
  @IsEnum(FormulaOp, { message: `formulaOp harus salah satu dari: ${Object.values(FormulaOp).join(', ')}` })
  formulaOp?: FormulaOp;

  @ApiPropertyOptional({ type: [String], description: 'Daftar UUID kolom sumber baru (wajib bila formulaOp diisi)' })
  @IsOptional()
  @IsArray()
  @Matches(UUID_RE, { each: true, message: 'Setiap formulaOperandId harus berformat UUID' })
  formulaOperandIds?: string[];
}
