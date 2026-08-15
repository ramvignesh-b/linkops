import { createZodDto } from 'nestjs-zod';
import { telemetryWindowQuerySchema } from '@linkops/shared/domain';

/**
 * `GET /api/links/:id/telemetry`'s query string. An unparseable `window`
 * fails here, through the same globally registered pipe every other query
 * and body goes through.
 */
export class TelemetryWindowQueryDto extends createZodDto(
  telemetryWindowQuerySchema,
) {}
