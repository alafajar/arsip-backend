import { Body, Controller, Get, Post, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { Roles, Role } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  me(@Request() req: { user: { id: string; username: string; role: string } }) {
    return req.user;
  }

  // Route uji — semua user login boleh (tidak ada @Roles)
  @Get('test-read')
  testRead() {
    return { ok: true, message: 'Semua user login boleh baca' };
  }

  // Route uji — hanya ADMIN
  @Post('test-write')
  @Roles(Role.ADMIN)
  testWrite() {
    return { ok: true, message: 'Hanya ADMIN yang sampai sini' };
  }
}
