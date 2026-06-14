import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(username: string, plainPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    const invalid =
      !user ||
      !user.isActive ||
      !(await verifyPassword(plainPassword, user.passwordHash));

    if (invalid) {
      throw new UnauthorizedException('Username atau password salah');
    }
    return user;
  }

  async issueTokens(user: { id: string; role: string }) {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const accessExpires = this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshExpires = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES');

    const accessToken = this.jwt.sign(
      { sub: user.id, role: user.role },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { secret: accessSecret, expiresIn: accessExpires as any },
    );

    const refreshToken = this.jwt.sign(
      { sub: user.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { secret: refreshSecret, expiresIn: refreshExpires as any },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await hashPassword(refreshToken),
        expiresAt,
        revokedAt: null,
      },
    });

    return { accessToken, refreshToken };
  }

  async setNewPassword(userId: string, plainPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(plainPassword) },
    });
  }

  async login(username: string, plainPassword: string) {
    const user = await this.validateUser(username, plainPassword);
    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
