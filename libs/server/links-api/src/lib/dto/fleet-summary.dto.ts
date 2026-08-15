import { createZodDto } from 'nestjs-zod';
import { fleetSummarySchema } from '@linkops/shared/domain';

/** The `FleetSummary` block `GET /api/fleet/summary` renders verbatim. */
export class FleetSummaryDto extends createZodDto(fleetSummarySchema) {}
