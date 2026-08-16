import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { A2uiEnvelope } from '@linkops/shared/a2ui-protocol';
import type { A2uiAgent } from './a2ui-agent';
import { A2UI_AGENT } from './a2ui-agent.token';
import { A2uiEnvelopeDto } from './dto/a2ui-envelope.dto';
import { A2uiRequestDto } from './dto/a2ui-request.dto';

/**
 * `POST /api/agent/ui` — the Assistant's only endpoint. A POST because the
 * request carries a body, and `200` rather than `201` because it creates
 * nothing an operator could go back and read: the Surface it answers with
 * lives in the reply.
 */
@Controller('agent')
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
      'VALIDATION_FAILED — the body is not an Assistant request. Error envelope as documented on every other endpoint.',
  })
  respond(@Body() request: A2uiRequestDto): A2uiEnvelope {
    return this.agent.respond(request);
  }
}
