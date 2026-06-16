import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
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

  // Menerbitkan access + refresh token.
  // Refresh token di-set sebagai httpOnly cookie pada `res`.
  // Mengembalikan hanya accessToken (refresh tidak pernah keluar lewat body).
  async issueTokens(user: { id: string; role: string }, res: Response): Promise<string> {
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

    this.setRefreshCookie(res, refreshToken, expiresAt);
    return accessToken;
  }

  async login(username: string, plainPassword: string, res: Response) {
    const user = await this.validateUser(username, plainPassword);
    const accessToken = await this.issueTokens(user, res);
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async refreshTokens(rawToken: string, res: Response) {
    // 1. Verifikasi tanda tangan & expiry JWT
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) as { sub: string };
    } catch {
      throw new UnauthorizedException();
    }

    // 2. Pastikan user masih aktif
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    // 3. Cari semua baris refresh token milik user yang belum expired
    const now = new Date();
    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
    });

    // Cocokkan token mentah ke salah satu hash
    let matched: (typeof candidates)[number] | undefined;
    for (const row of candidates) {
      if (await verifyPassword(rawToken, row.tokenHash)) {
        matched = row;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException();
    }

    // 4. Reuse detection: token sudah di-revoke → sinyal pencurian
    if (matched.revokedAt !== null) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: now },
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    // 5. Rotasi: revoke lama, terbitkan pasangan baru
    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revokedAt: now },
    });

    const accessToken = await this.issueTokens(user, res);
    return { accessToken };
  }

  async logout(userId: string, rawToken: string | undefined, res: Response) {
    if (rawToken) {
      const now = new Date();
      // Cari dan revoke hanya baris yang cocok dengan cookie ini
      const candidates = await this.prisma.refreshToken.findMany({
        where: { userId, expiresAt: { gt: now }, revokedAt: null },
      });
      for (const row of candidates) {
        if (await verifyPassword(rawToken, row.tokenHash)) {
          await this.prisma.refreshToken.update({
            where: { id: row.id },
            data: { revokedAt: now },
          });
          break;
        }
      }
    }
    this.clearRefreshCookie(res);
  }

  async setNewPassword(userId: string, plainPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(plainPassword) },
    });
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: (this.config.get<string>('COOKIE_SAME_SITE') ?? 'lax') as 'lax' | 'strict' | 'none',
      path: '/auth',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie('refresh_token', { path: '/auth' });
  }
}
