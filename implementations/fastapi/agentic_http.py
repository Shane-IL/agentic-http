"""
agentic-http — FastAPI / Starlette middleware
https://agentic-http.dev

Usage:

    from agentic_http import agentic_http, add_well_known

    app = FastAPI()
    add_well_known(app, description="Acme Corp API v2")

    @app.delete("/users/{user_id}")
    @agentic_http(
        intent="Permanently deletes a user account and all associated data.",
        effect="delete",
        reversible=False,
        idempotent=True,
        retry_safe=False,
        side_effects=["purges-storage", "cancels-subscriptions", "sends-email"],
        preconditions=["User must have no active paid subscriptions"],
        typical_next=["/api/v1/audit-log"],
        error_guidance={
            "409": "Active subscription exists. Call DELETE /api/v1/subscriptions/{id} first.",
            "404": "User not found. Verify ID before retrying.",
        },
    )
    async def delete_user(user_id: str, request: Request):
        ...
"""

import functools
import json
from typing import Callable, Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SUPPORTED_VERSION = "1.0"
REQUIRED_FIELDS = {"intent", "effect", "reversible", "idempotent", "retry_safe"}


def _is_agent_request(request: Request) -> bool:
    return (
        request.headers.get("x-agent-client") == "true"
        and "x-agent-protocol" in request.headers
    )


def _has_agentic_scope(request: Request) -> bool:
    """
    Default scope checker. Override by passing check_scope= to agentic_http().
    Looks for 'agentic:read' in the token scope claim.
    Compatible with fastapi-auth0 and python-jose style decoded tokens.
    """
    token_data = getattr(request.state, "token", None) or {}
    scope = token_data.get("scope", "") or ""
    return "agentic:read" in scope.split()


def agentic_http(
    intent: str,
    effect: str,
    reversible: bool,
    idempotent: bool,
    retry_safe: bool,
    side_effects: Optional[list] = None,
    preconditions: Optional[list] = None,
    typical_next: Optional[list] = None,
    error_guidance: Optional[dict] = None,
    extensions: Optional[dict] = None,
    check_scope: Optional[Callable] = None,
):
    """
    Decorator that appends agent-meta to JSON responses when the caller
    is an authenticated Agentic-HTTP agent.
    """
    meta = {
        "version": SUPPORTED_VERSION,
        "intent": intent,
        "effect": effect,
        "reversible": reversible,
        "idempotent": idempotent,
        "retry-safe": retry_safe,
    }
    if side_effects:
        meta["side-effects"] = side_effects
    if preconditions:
        meta["preconditions"] = preconditions
    if typical_next:
        meta["typical-next"] = typical_next
    if error_guidance:
        meta["error-guidance"] = error_guidance
    if extensions:
        meta["extensions"] = extensions

    scope_checker = check_scope or _has_agentic_scope

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            response = await func(request, *args, **kwargs)

            if not _is_agent_request(request) or not scope_checker(request):
                return response

            # Only enrich successful JSON responses
            if isinstance(response, JSONResponse) and response.status_code < 400:
                try:
                    body = json.loads(response.body)
                    if isinstance(body, dict):
                        body["agent-meta"] = meta
                        return JSONResponse(
                            content=body,
                            status_code=response.status_code,
                            headers=dict(response.headers),
                        )
                except (json.JSONDecodeError, AttributeError):
                    pass

            return response

        return wrapper

    return decorator


def add_well_known(
    app: FastAPI,
    description: str = "",
    endpoints: Optional[dict] = None,
):
    """
    Mounts the /.well-known/agentic-http.json discovery endpoint on the app.
    """
    payload = {
        "agentic-http-version": SUPPORTED_VERSION,
        "description": description,
        "endpoints": endpoints or {},
    }

    @app.get("/.well-known/agentic-http.json", include_in_schema=False)
    async def agentic_http_well_known():
        return payload
