import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ColumnType, FormulaOp } from '../../../generated/prisma/enums';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateColumnDto {
  @ApiProperty({ example: 'Jabatan Akademik', description: 'Nama kolom (non-kosong)' })
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong' })
  name!: string;

  @ApiProperty({ enum: ColumnType, example: ColumnType.TEXT, description: 'Tipe kolom' })
  @IsEnum(ColumnType, { message: `type harus salah satu dari: ${Object.values(ColumnType).join(', ')}` })
  type!: ColumnType;

  @ApiPropertyOptional({ example: null, description: 'UUID kolom induk (harus kolom grup di sheet yang sama); null = kolom top-level' })
  @IsOptional()
  @Matches(UUID_RE, { message: 'parentColumnId harus berformat UUID' })
  parentColumnId?: string;

  @ApiPropertyOptional({ example: 1, description: 'Urutan antar sibling (opsional; default = max+1)' })
  @IsOptional()
  @IsInt({ message: 'orderIndex harus bilangan bulat' })
  @Min(1, { message: 'orderIndex minimal 1' })
  orderIndex?: number;

  @ApiPropertyOptional({ enum: FormulaOp, description: 'Operasi formula horizontal (opsional; null = kolom biasa). Validasi penuh operand di task 013.' })
  @IsOptional()
  @IsEnum(FormulaOp, { message: `formulaOp harus salah satu dari: ${Object.values(FormulaOp).join(', ')}` })
  formulaOp?: FormulaOp;

  @ApiPropertyOptional({ type: [String], description: 'Daftar UUID kolom sumber, terurut (wajib bila formulaOp diisi)' })
  @IsOptional()
  @IsArray()
  @Matches(UUID_RE, { each: true, message: 'Setiap formulaOperandId harus berformat UUID' })
  formulaOperandIds?: string[];
}
