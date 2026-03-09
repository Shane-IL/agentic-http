import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AGENTIC_META_KEY } from './agentic-meta.decorator';
import {
  AgentMeta,
  AgentMetaOptions,
  AgenticHttpModuleOptions,
  AGENTIC_HTTP_OPTIONS,
} from './types';

function isAgentRequest(req: Record<string, any>): boolean {
  return (
    req.headers?.['x-agent-client'] === 'true' &&
    req.headers?.['x-agent-protocol'] !== undefined
  );
}

function defaultCheckScope(req: Record<string, any>): boolean {
  const scope: string =
    req.auth?.payload?.scope ?? req.user?.scope ?? '';
  return scope.split(' ').includes('agentic:read');
}

/** Map camelCase decorator input to spec-compliant hyphenated output keys. */
function buildAgentMeta(options: AgentMetaOptions): AgentMeta {
  const meta: AgentMeta = {
    version: '1.0',
    intent: options.intent,
    effect: options.effect,
    reversible: options.reversible,
    idempotent: options.idempotent,
    'retry-safe': options.retrySafe,
  };

  if (options.sideEffects?.length) meta['side-effects'] = options.sideEffects;
  if (options.preconditions?.length) meta['preconditions'] = options.preconditions;
  if (options.typicalNext?.length) meta['typical-next'] = options.typicalNext;
  if (options.errorGuidance) meta['error-guidance'] = options.errorGuidance;
  if (options.extensions) meta['extensions'] = options.extensions;

  return meta;
}

@Injectable()
export class AgenticHttpInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AGENTIC_HTTP_OPTIONS)
    private readonly moduleOptions: AgenticHttpModuleOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metaOptions = this.reflector.get<AgentMetaOptions | undefined>(
      AGENTIC_META_KEY,
      context.getHandler(),
    );

    // Route not decorated — pass through untouched
    if (!metaOptions) return next.handle();

    const req = context.switchToHttp().getRequest<Record<string, any>>();

    const scopeCheck = this.moduleOptions.checkScope ?? defaultCheckScope;
    if (!isAgentRequest(req) || !scopeCheck(req)) {
      return next.handle();
    }

    const res = context.switchToHttp().getResponse<Record<string, any>>();
    const agentMeta = buildAgentMeta(metaOptions);

    return next.handle().pipe(
      map((data) => {
        // Don't enrich error responses (e.g. from @HttpCode(409) handlers)
        if (res.statusCode >= 400) return data;
        // Only enrich plain object bodies — not arrays, null, or primitives
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          return data;
        }
        return { ...(data as Record<string, unknown>), 'agent-meta': agentMeta };
      }),
    );
  }
}
