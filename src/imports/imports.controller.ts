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
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { ImportsService } from './imports.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
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
