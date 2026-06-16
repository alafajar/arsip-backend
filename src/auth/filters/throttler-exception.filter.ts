import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: 429,
      message: 'Terlalu banyak percobaan, coba lagi nanti.',
      error: 'Too Many Requests',
    });
  }
}
