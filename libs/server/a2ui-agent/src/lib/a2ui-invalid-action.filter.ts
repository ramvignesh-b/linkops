import { Catch, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { A2uiInvalidActionError } from '@linkops/shared/a2ui-protocol';
import type { ApiErrorBody } from '@linkops/shared/domain';

/**
 * Maps an unrecognised Action onto the closed `A2UI_INVALID_PAYLOAD` code —
 * the same one the Console produces in the other direction. Scoped to
 * `AgentUiController` with `@UseFilters` rather than registered
 * application-wide: `ServerLinksApiModule` owns the app's shared filter and
 * pipe, and a feature library may not depend on another (see
 * `ServerA2uiAgentModule`'s own doc comment), so this endpoint answers for
 * its own domain error, and — unlike the malformed-body case — this
 * refusal is assertable from this library's own module spec.
 */
@Catch(A2uiInvalidActionError)
export class A2uiInvalidActionFilter implements ExceptionFilter {
  catch(exception: A2uiInvalidActionError, host: ArgumentsHost): void {
    const body: ApiErrorBody = {
      code: 'A2UI_INVALID_PAYLOAD',
      message: exception.message,
      details: { reason: exception.message },
    };

    host
      .switchToHttp()
      .getResponse()
      .status(HttpStatus.BAD_REQUEST)
      .json({ error: body });
  }
}
