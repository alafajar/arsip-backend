import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateMenuDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name tidak boleh kosong jika disertakan' })
  name?: string;

  // null = pindah ke top-level; undefined = tidak ubah; UUID = pindah ke parent baru
  @IsOptional()
  @Matches(UUID_RE, { message: 'parentId harus berformat UUID jika diisi' })
  parentId?: string | null;
}
