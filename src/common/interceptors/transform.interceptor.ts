import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: unknown) => {
        const statusCode = response.statusCode;
        const payload = data as Record<string, unknown> | null | undefined;

        // { message: '...' } responses (delete, logout, etc.) — surface message, no data field
        if (payload && typeof payload === 'object' && 'message' in payload && Object.keys(payload).length === 1) {
          return {
            success: true,
            statusCode,
            message: payload.message,
          };
        }

        return {
          success: true,
          statusCode,
          message: 'Success',
          data,
        };
      }),
    );
  }
}
