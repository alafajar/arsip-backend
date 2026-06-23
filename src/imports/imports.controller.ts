import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { ImportsService } from './imports.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Import file Excel DTPS (ADMIN)',
    description:
      'Upload file `.xlsx`. Sheet bernama "DTPS" di-parse secara semantik ' +
      '(header 2 baris, data mulai baris 4). Sheet lain di-mirror sebagai grid read-only.\n\n' +
      'Field form:\n- `file` (required): file .xlsx, maks 10 MB\n' +
      '- `name` (optional): nama tampilan sheet; default = nama worksheet\n' +
      '- `parentMenuId` (optional): UUID menu parent untuk sheet yang dibuat',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'File .xlsx (maks 10 MB)' },
        name: { type: 'string', example: 'Data Dosen Tetap S1', description: 'Nama tampilan sheet (opsional)' },
        parentMenuId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000', description: 'UUID menu parent (opsional)' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Import berhasil; mengembalikan daftar sheet yang dibuat.' })
  @ApiResponse({ status: 400, description: 'File bukan .xlsx, melebihi 10 MB, atau format tidak valid.' })
  @ApiResponse({ status: 403, description: 'Hanya ADMIN.' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter(_req, file, cb) {
        const isXlsx =
          file.mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.originalname.toLowerCase().endsWith('.xlsx');
        if (!isXlsx) {
          cb(
            new BadRequestException(
              'Hanya file .xlsx yang diizinkan.',
            ),
            false,
          );
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async importFile(
    @UploadedFile() file: Express.Multer.File,
    @Request()
    req: { user: { id: string }; body: { name?: string; parentMenuId?: string } },
  ) {
    if (!file) {
      throw new BadRequestException('File wajib diunggah (field: "file").');
    }
    return this.importsService.importWorkbook(
      file,
      req.user.id,
      req.body.name,
      req.body.parentMenuId,
    );
  }
}
