import { Controller, Get, Inject } from '@nestjs/common';
import type { FleetSummary } from '@linkops/shared/domain';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';

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
  summary(): FleetSummary {
    return this.telemetry.summary();
  }
}
