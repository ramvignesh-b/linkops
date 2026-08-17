import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { A2uiEnvelope } from '@linkops/shared/a2ui-protocol';
import type { A2uiAgent } from './a2ui-agent';
import { A2UI_AGENT } from './a2ui-agent.token';
import { A2uiInvalidActionFilter } from './a2ui-invalid-action.filter';
import { A2uiEnvelopeDto } from './dto/a2ui-envelope.dto';
import { A2uiRequestDto } from './dto/a2ui-request.dto';

/**
 * `POST /api/agent/ui` — the Assistant's only endpoint. A POST because the
 * request carries a body, and `200` rather than `201` because it creates
 * nothing an operator could go back and read: the Surface it answers with
 * lives in the reply.
 */
@Controller('agent')
@UseFilters(A2uiInvalidActionFilter)
export class AgentUiController {
  constructor(@Inject(A2UI_AGENT) private readonly agent: A2uiAgent) {}

  @Post('ui')
  @HttpCode(200)
  @ZodResponse({ status: 200, type: A2uiEnvelopeDto })
  @ApiResponse({
    status: 400,
    // Described rather than typed: the envelope's DTO lives in
    // `server/links-api`, and a feature library may not import another
    // feature library. The shape is the same one every endpoint documents.
    description:
      'VALIDATION_FAILED — the body is not an Assistant request. A2UI_INVALID_PAYLOAD — an Action names a Surface, Link or Remediation the Assistant does not recognise. Error envelope as documented on every other endpoint.',
  })
  async respond(@Body() request: A2uiRequestDto): Promise<A2uiEnvelope> {
    return await this.agent.respond(request);
  }
}
