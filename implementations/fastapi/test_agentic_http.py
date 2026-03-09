"""
Tests for the FastAPI/Starlette agentic-http decorator.
Run with: pytest implementations/fastapi/
"""

import json
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from httpx import AsyncClient, ASGITransport

from agentic_http import agentic_http, add_well_known

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

AGENT_HEADERS = {
    "x-agent-client": "true",
    "x-agent-protocol": "1.0",
}

VALID_META = dict(
    intent="Creates a new user account.",
    effect="write",
    reversible=False,
    idempotent=False,
    retry_safe=False,
)


def build_app(check_scope=None) -> FastAPI:
    """Build a minimal FastAPI app with annotated routes for testing."""
    app = FastAPI()

    scope_kwarg = {"check_scope": check_scope} if check_scope is not None else {}

    @app.post("/users", status_code=201)
    @agentic_http(**VALID_META, **scope_kwarg)
    async def create_user(request: Request):
        return JSONResponse({"id": "usr_123", "email": "jane@example.com"}, status_code=201)

    @app.get("/items")
    @agentic_http(**VALID_META, **scope_kwarg)
    async def list_items(request: Request):
        return JSONResponse([1, 2, 3])

    @app.get("/fail")
    @agentic_http(**VALID_META, **scope_kwarg)
    async def failing_endpoint(request: Request):
        return JSONResponse({"error": "conflict"}, status_code=409)

    @app.get("/plain")
    @agentic_http(**VALID_META, **scope_kwarg)
    async def plain_endpoint(request: Request):
        return PlainTextResponse("hello")

    @app.get("/with-optionals")
    @agentic_http(
        **VALID_META,
        side_effects=["sends-email", "creates-db-record"],
        preconditions=["email must not already exist"],
        typical_next=["/api/v1/users/{id}/verify"],
        error_guidance={"409": "User already exists."},
        **scope_kwarg,
    )
    async def with_optionals(request: Request):
        return JSONResponse({"ok": True})

    add_well_known(
        app,
        description="Test API",
        endpoints={"/users": {"methods": ["POST"]}},
    )

    return app


# ---------------------------------------------------------------------------
# Non-agent requests — agent-meta must not appear
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_agent_headers_no_meta():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users")
    assert res.status_code == 201
    body = res.json()
    assert "agent-meta" not in body
    assert body["id"] == "usr_123"


@pytest.mark.asyncio
async def test_wrong_agent_client_value_no_meta():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users", headers={"x-agent-client": "yes", "x-agent-protocol": "1.0"})
    assert "agent-meta" not in res.json()


@pytest.mark.asyncio
async def test_missing_protocol_header_no_meta():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users", headers={"x-agent-client": "true"})
    assert "agent-meta" not in res.json()


# ---------------------------------------------------------------------------
# Agent requests with scope satisfied
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_request_appends_meta():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users", headers=AGENT_HEADERS)
    assert res.status_code == 201
    body = res.json()
    assert "agent-meta" in body
    meta = body["agent-meta"]
    assert meta["version"] == "1.0"
    assert meta["intent"] == VALID_META["intent"]
    assert meta["effect"] == "write"
    assert meta["reversible"] is False
    assert meta["idempotent"] is False
    assert meta["retry-safe"] is False


@pytest.mark.asyncio
async def test_agent_request_preserves_original_fields():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users", headers=AGENT_HEADERS)
    body = res.json()
    assert body["id"] == "usr_123"
    assert body["email"] == "jane@example.com"


@pytest.mark.asyncio
async def test_error_response_no_meta():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/fail", headers=AGENT_HEADERS)
    assert res.status_code == 409
    assert "agent-meta" not in res.json()


@pytest.mark.asyncio
async def test_array_response_no_meta():
    """Arrays are valid JSON but not enrichable — must be returned unchanged."""
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/items", headers=AGENT_HEADERS)
    assert res.json() == [1, 2, 3]


@pytest.mark.asyncio
async def test_non_json_response_unchanged():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/plain", headers=AGENT_HEADERS)
    assert res.text == "hello"


# ---------------------------------------------------------------------------
# Scope checking
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scope_fail_no_meta():
    app = build_app(check_scope=lambda r: False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/users", headers=AGENT_HEADERS)
    assert "agent-meta" not in res.json()


@pytest.mark.asyncio
async def test_custom_scope_checker_receives_request():
    """Verify the check_scope callable receives the Request object."""
    received = []

    def capture_scope(request):
        received.append(request)
        return True

    app = build_app(check_scope=capture_scope)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/users", headers=AGENT_HEADERS)

    assert len(received) == 1
    from starlette.requests import Request as StarletteRequest
    assert isinstance(received[0], StarletteRequest)


# ---------------------------------------------------------------------------
# Optional fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_optional_fields_forwarded():
    app = build_app(check_scope=lambda r: True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/with-optionals", headers=AGENT_HEADERS)
    meta = res.json()["agent-meta"]
    assert meta["side-effects"] == ["sends-email", "creates-db-record"]
    assert meta["preconditions"] == ["email must not already exist"]
    assert meta["typical-next"] == ["/api/v1/users/{id}/verify"]
    assert meta["error-guidance"]["409"] == "User already exists."


# ---------------------------------------------------------------------------
# Discovery endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_well_known_served():
    app = build_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/.well-known/agentic-http.json")
    assert res.status_code == 200
    body = res.json()
    assert body["agentic-http-version"] == "1.0"
    assert body["description"] == "Test API"
    assert body["endpoints"] == {"/users": {"methods": ["POST"]}}


@pytest.mark.asyncio
async def test_well_known_accessible_without_agent_headers():
    app = build_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/.well-known/agentic-http.json")
    assert res.status_code == 200
