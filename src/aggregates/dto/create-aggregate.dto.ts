import { IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AggregateOp } from '../../../generated/prisma/enums';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateAggregateDto {
  @ApiProperty({ example: 'uuid', description: 'UUID kolom yang akan diagregasi' })
  @Matches(UUID_RE, { message: 'targetColumnId harus berformat UUID' })
  targetColumnId!: string;

  @ApiProperty({ enum: AggregateOp, description: 'Operasi agregat' })
  @IsEnum(AggregateOp, { message: `op harus salah satu dari: ${Object.values(AggregateOp).join(', ')}` })
  op!: AggregateOp;
}
