# Local Webhook Recorder

[![CI](https://github.com/bellussi1/local-webhook-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/bellussi1/local-webhook-recorder/actions/workflows/ci.yml)

Record a webhook once. Inspect it locally. Replay it after fixing your handler.

A Node.js/TypeScript CLI with local SQLite, byte-preserving capture and explicit replay to loopback test endpoints. No account, public tunnel or production dependencies.

## Install from source

Requires **Node.js 24+**. Native `node:sqlite` is experimental in Node 24.13 and emits a warning to stderr; JSON stdout remains machine-readable. Not published on npm yet.

```sh
git clone https://github.com/bellussi1/local-webhook-recorder.git
cd local-webhook-recorder
npm ci
npm test
npm pack
npm install --global ./local-webhook-recorder-0.1.0.tgz
webhook-recorder --help
```

## Capture and inspect

```sh
webhook-recorder serve --port 8787 --db ./webhooks.sqlite
```

In another terminal:

```sh
curl -X POST http://127.0.0.1:8787/webhooks -H 'Content-Type: application/json' --data-binary @examples/order.json
webhook-recorder list --db ./webhooks.sqlite --json
webhook-recorder show EVENT_ID --db ./webhooks.sqlite --json
```

On PowerShell use `curl.exe`. Capture returns HTTP 202 and the event ID after persistence. `list` shows metadata only; `show` reveals selected headers and base64 payload, preserving binary bytes and malformed JSON. Decode `body.data` with `Buffer.from(data, 'base64')` in Node. Text output also uses base64.

## Replay and idempotency demo

```sh
node examples/handler.mjs
webhook-recorder replay EVENT_ID --to http://127.0.0.1:3000/webhooks --json
webhook-recorder replay EVENT_ID --to http://127.0.0.1:3000/webhooks --json
```

Capture `examples/order.json` first. The demo tracks the payload's ID: the handler returns `processed` once, then `duplicate`. Its Set is in memory and resets on restart; production idempotency needs durable storage. Tests verify one logical processed event after duplicate replay. The CLI reports status without printing the response body.

**Replay sends a real request and can duplicate side effects.** Use a local test handler. Destination must use literal `http://127.0.0.1` or `http://[::1]`; localhost, numeric aliases, remote hosts, credentials and HTTPS are rejected. Redirects are never followed. Timeout is five seconds until response headers; response bodies are discarded.

## Commands

| Command | Options | Result |
| --- | --- | --- |
| `serve` | `--port` (8787), `--db`, `--json` | POST receiver on 127.0.0.1; JSON lines if requested. |
| `list` | `--limit` (20, 1–100), `--db`, `--json` | Newest metadata first. |
| `show <id>` | `--db`, `--json` | Headers and `body:{encoding:"base64",data:"..."}`. |
| `replay <id>` | required `--to`, `--db`, `--json` | Original method/body, allowed headers only. |
| `--help`, `--version` | none | Work without opening SQLite. |

Default DB: `./webhooks.sqlite`, relative to cwd. Port: 1–65535. Read commands never create a missing DB. Unknown, duplicate and incompatible flags fail.

Exit **0**: success; **1**: event not found or failed replay; **2**: arguments, destination, bind or DB error. Errors use static codes such as `ARGS_INVALID`, `DB_UNAVAILABLE`, `EVENT_NOT_FOUND`, `DESTINATION_INVALID`. JSON errors have `{error:{code,message}}`.

## Storage and limits

- Bodies: **1 MiB (1048576 bytes)**; overflow returns 413 with no event, including chunked uploads.
- Retention: **1000 newest events**, pruned atomically with inserts.
- Stored/replayed headers: only `content-type`, `user-agent`, `x-request-id`. Authorization, Cookie, API keys, signatures and arbitrary headers are excluded. Signature-protected handlers need a local development path.
- Payload fields are **not automatically redacted**. Logs/list omit bodies; show exposes them explicitly. Protect the local DB and never commit it. The tool never uploads databases.
- Only POST `/webhooks`; other routes/methods return 404/405. No query-string capture, public bind, tunnels or remote replay.
- Header timeout 10s, request timeout 15s. SIGINT/SIGTERM close listener then DB; lingering connections close after 1s. Windows forced kill is not a graceful signal test.
- Localhost capture cannot receive remote provider requests directly. Generate local test requests for this MVP.

## Development

```sh
npm ci
npm test
npm audit
npm pack --dry-run
```

Tests use temporary databases, local HTTP servers, real subprocesses and an installed tarball. CI covers Windows/Linux. npm publication is separate.

See [architecture](https://github.com/bellussi1/local-webhook-recorder/blob/main/docs/architecture.md), [contribution guide](https://github.com/bellussi1/local-webhook-recorder/blob/main/CONTRIBUTING.md) and [changelog](https://github.com/bellussi1/local-webhook-recorder/blob/main/CHANGELOG.md).

MIT © Enzo Bellussi.
