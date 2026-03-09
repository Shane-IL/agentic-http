import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AgenticHttpInterceptor } from './agentic-http.interceptor';
import { WellKnownController } from './well-known.controller';
import { AgenticHttpModuleOptions, AGENTIC_HTTP_OPTIONS } from './types';

/**
 * NestJS module for Agentic-HTTP.
 *
 * Import in your AppModule:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     AgenticHttpModule.forRoot({
 *       description: 'Acme Corp API v2',
 *       endpoints: {
 *         '/api/v1/users': { methods: ['GET', 'POST', 'DELETE'] },
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * Then decorate individual route handlers with @AgenticMeta().
 */
@Module({})
export class AgenticHttpModule {
  static forRoot(options: AgenticHttpModuleOptions = {}): DynamicModule {
    return {
      global: true,
      module: AgenticHttpModule,
      controllers: [WellKnownController],
      providers: [
        {
          provide: AGENTIC_HTTP_OPTIONS,
          useValue: options,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: AgenticHttpInterceptor,
        },
      ],
    };
  }
}
