import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateMenuDto {
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong' })
  name!: string;

  @IsOptional()
  @Matches(UUID_RE, { message: 'parentId harus berformat UUID' })
  parentId?: string;
}
