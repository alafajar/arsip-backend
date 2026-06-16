import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MenuModule } from './menu/menu.module';
import { SheetsModule } from './sheets/sheets.module';
import { ColumnsModule } from './columns/columns.module';
import { RowsModule } from './rows/rows.module';
import { CellsModule } from './cells/cells.module';
import { ImportsModule } from './imports/imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_MS') ?? 60_000,
            limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MenuModule,
    SheetsModule,
    ColumnsModule,
    RowsModule,
    CellsModule,
    ImportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
