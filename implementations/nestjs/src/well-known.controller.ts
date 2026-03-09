import { Controller, Get, Inject } from '@nestjs/common';
import { AgenticHttpModuleOptions, AGENTIC_HTTP_OPTIONS } from './types';

@Controller('.well-known')
export class WellKnownController {
  constructor(
    @Inject(AGENTIC_HTTP_OPTIONS)
    private readonly options: AgenticHttpModuleOptions,
  ) {}

  @Get('agentic-http.json')
  get() {
    return {
      'agentic-http-version': '1.0',
      description: this.options.description ?? '',
      endpoints: this.options.endpoints ?? {},
    };
  }
}
