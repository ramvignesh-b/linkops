import { createZodDto } from 'nestjs-zod';
import { telemetrySampleSchema } from '@linkops/shared/domain';

/** One Telemetry Sample as `GET /api/links/:id/telemetry` returns it. */
export class TelemetrySampleDto extends createZodDto(telemetrySampleSchema) {}
