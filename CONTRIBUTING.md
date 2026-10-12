# Contributing

Small, focused contributions are welcome. Open an issue to discuss new checks or changes to the capture and replay contract before starting a large implementation.

## Setup

Use Node.js 24 and npm. Fork the repository, then:

```sh
git clone https://github.com/YOUR_USERNAME/local-webhook-recorder.git
cd local-webhook-recorder
npm ci
npm test
```

## Branches and commits

`main` contains reviewed work. Create short-lived branches from `main`: `feat/<topic>`, `fix/<topic>` or `docs/<topic>`. The retained `feat/mvp` branch records the first implementation; it is not a second development branch.

Use meaningful Conventional Commits, for example `fix: preserve empty environment values`. Each commit should describe an actual change. Do not add empty commits or split unrelated lines to increase activity.

## Pull requests

1. Add a failing behavioral test for a code change, then implement the fix.
2. Keep URL tests local and fixtures free of credentials.
3. Run `npm test`, `npm audit` and `npm pack --dry-run`.
4. Explain the problem, resulting behavior and validation in the PR template.
5. Update the README and changelog when behavior or configuration changes.

Avoid raw exceptions, captured payloads, resolved URLs or response bodies in reports. Preserve exit codes: 0 success, 1 missing event or replay failure, 2 invalid invocation/database/destination.

Production dependencies need a concrete reason. Prefer Node APIs when they satisfy the behavior. Formatting follows `.editorconfig`; files use LF endings. The CI matrix validates Windows and Linux.

## Releases

The initial release is distributed as a local tarball. npm publication is a separate maintainer action: verify the package name and account, run checks, review tarball contents, then publish. Never commit tokens or registry credentials.

