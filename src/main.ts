import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ThrottlerExceptionFilter } from './auth/filters/throttler-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Express 5 mengubah default query parser dari 'extended' (qs) ke 'simple' (URLSearchParams).
  // Filter faceted memakai bracket notation qs: filter[uuid][]=v1 — harus dikembalikan ke extended.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app.getHttpAdapter().getInstance() as any).set('query parser', 'extended');

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // buang field yang tak ada di DTO
      forbidNonWhitelisted: true, // tolak (400) kalau ada field asing
      transform: true,            // ubah payload ke tipe DTO
    }),
  );
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // Trust proxy: set ke 1 di belakang Nginx/Cloudflare agar IP nyata terbaca
  if (process.env['TRUST_PROXY'] && process.env['TRUST_PROXY'] !== 'false') {
    const adapter = app.getHttpAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter.getInstance() as any).set('trust proxy', process.env['TRUST_PROXY']);
  }

  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Arsip LAMTEK API')
    .setDescription(
      'API untuk sistem dokumentasi & arsip akreditasi LAMTEK.\n\n' +
      '**Auth:** `POST /auth/login` → salin `accessToken` dari respons → klik **Authorize** → isi `Bearer <token>`.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
