import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string | string[];
    let error: string;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      error = exception.message;
    } else {
      const res = exceptionResponse as Record<string, unknown>;
      message = (res.message as string | string[]) ?? exception.message;
      error = (res.error as string) ?? 'Error';
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
    });
  }
}
