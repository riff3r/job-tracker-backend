import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const routeMessage = this.reflector.get<string>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((data: unknown) => {
        const statusCode = response.statusCode;
        const payload = data as Record<string, unknown> | null | undefined;

        // { message: '...' } only responses (delete, logout, etc.) — surface message, no data field
        if (
          payload &&
          typeof payload === 'object' &&
          'message' in payload &&
          Object.keys(payload).length === 1
        ) {
          return {
            success: true,
            statusCode,
            message: payload.message,
          };
        }

        return {
          success: true,
          statusCode,
          message: routeMessage ?? 'Success',
          data,
        };
      }),
    );
  }
}
