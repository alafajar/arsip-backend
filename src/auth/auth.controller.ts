import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator';
import { Roles, Role } from './decorators/roles.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: Number(process.env['THROTTLE_LOGIN_LIMIT'] ?? 5), ttl: 60_000 } })
  @ApiOperation({ summary: 'Login', description: 'Kembalikan `accessToken` (Bearer) dan set `refresh_token` sebagai httpOnly cookie.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login berhasil; salin `accessToken` → klik Authorize di atas.', schema: { example: { accessToken: 'eyJhbGci...' } } })
  @ApiResponse({ status: 401, description: 'Username atau password salah.' })
  @ApiResponse({ status: 429, description: 'Terlalu banyak percobaan login.' })
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto.username, dto.password, res);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: Number(process.env['THROTTLE_REFRESH_LIMIT'] ?? 10), ttl: 60_000 } })
  @ApiOperation({ summary: 'Refresh token', description: 'Baca `refresh_token` dari cookie → kembalikan `accessToken` baru.' })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({ status: 201, description: 'Token baru.', schema: { example: { accessToken: 'eyJhbGci...' } } })
  @ApiResponse({ status: 401, description: 'Refresh token tidak valid atau sudah expired.' })
  refresh(
    @Request() req: { cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies['refresh_token'];
    if (!token) throw new UnauthorizedException();
    return this.authService.refreshTokens(token, res);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout', description: 'Hapus refresh token dari DB dan clear cookie.' })
  @ApiResponse({ status: 201, description: 'Berhasil logout.', schema: { example: { message: 'Logged out' } } })
  async logout(
    @Request() req: { user: { id: string }; cookies: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies['refresh_token'];
    await this.authService.logout(req.user.id, token, res);
    return { message: 'Logged out' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil user saat ini' })
  @ApiResponse({ status: 200, schema: { example: { id: 'uuid', username: 'admin', role: 'ADMIN' } } })
  me(@Request() req: { user: { id: string; username: string; role: string } }) {
    return req.user;
  }

  // Route uji — semua user login boleh (tidak ada @Roles)
  @Get('test-read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uji akses semua user login' })
  testRead() {
    return { ok: true, message: 'Semua user login boleh baca' };
  }

  // Route uji — hanya ADMIN
  @Post('test-write')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uji akses ADMIN only' })
  testWrite() {
    return { ok: true, message: 'Hanya ADMIN yang sampai sini' };
  }
}
