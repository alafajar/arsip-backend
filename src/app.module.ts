import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
