import { Controller, Get, Inject } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';
import type { FleetSummary } from '@linkops/shared/domain';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';
import { FleetSummaryDto } from './dto/fleet-summary.dto';

/**
 * `GET /api/fleet/summary` renders `TelemetryPort.summary()` verbatim — no
 * aggregation happens here. The Summary is server-authoritative precisely
 * because there is exactly one place it is computed, and this controller is
 * not it.
 */
@Controller('fleet')
export class FleetController {
  constructor(
    @Inject(TELEMETRY_PORT) private readonly telemetry: TelemetryPort,
  ) {}

  @Get('summary')
  @ZodResponse({ status: 200, type: FleetSummaryDto })
  summary(): FleetSummary {
    return this.telemetry.summary();
  }
}
