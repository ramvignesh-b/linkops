import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ZodValidationException } from 'nestjs-zod';
import type { z } from 'zod';
import {
  type ApiErrorBody,
  zodIssuesToFieldIssues,
} from '@linkops/shared/domain';
import { LinkNameTakenError } from './errors/link-name-taken.error';
import { LinkNotFoundError } from './errors/link-not-found.error';

/**
 * The one place domain-error → HTTP-status mapping happens. Everything it
 * does not recognise it hands to Nest's default handling unwrapped, rather
 * than synthesising an envelope that would lie about where the failure came
 * from — the `code` union is closed and has no internal-error member.
 */
@Catch()
export class LinkDomainErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof LinkNotFoundError) {
      this.respond(host, 404, {
        code: 'LINK_NOT_FOUND',
        message: exception.message,
        details: { id: exception.id },
      });

      return;
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as z.ZodError;

      this.respond(host, 400, {
        code: 'VALIDATION_FAILED',
        message: exception.message,
        details: { issues: zodIssuesToFieldIssues(zodError.issues) },
      });

      return;
    }

    if (exception instanceof LinkNameTakenError) {
      this.respond(host, 409, {
        code: 'LINK_NAME_TAKEN',
        message: exception.message,
        details: { name: exception.linkName },
      });

      return;
    }

    super.catch(exception, host);
  }

  private respond(host: ArgumentsHost, status: number, body: ApiErrorBody) {
    host.switchToHttp().getResponse().status(status).json({ error: body });
  }
}
