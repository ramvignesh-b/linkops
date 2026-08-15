import { Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { ApiErrorBody } from '@linkops/shared/domain';
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
      const body: ApiErrorBody = {
        code: 'LINK_NOT_FOUND',
        message: exception.message,
        details: { id: exception.id },
      };

      host.switchToHttp().getResponse().status(404).json({
        error: body,
      });

      return;
    }

    super.catch(exception, host);
  }
}
