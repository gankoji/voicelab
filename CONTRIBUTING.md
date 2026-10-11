# Contributing

Start with the [requirements](docs/requirements.md) and
[architecture](docs/architecture.md). The project is at the foundation stage;
use the [roadmap](docs/roadmap.md) to keep changes focused.

## Workflow

1. Install the Node version in `.nvmrc`, then run `npm ci`.
2. Keep each change scoped to a requirement or milestone.
3. Add unit tests for deterministic logic and browser tests for user workflows.
4. Run `npm run check` and, after installing Chromium with
   `npx playwright install chromium`, `npm run test:e2e` and
   `npm run test:e2e:dev` sequentially.
5. Explain behavior changes, validation, and known limitations in the review.

Commit the npm lockfile when dependencies change. Review dependency licenses
and browser compatibility before adding DSP libraries. The source and its
documentation are MIT-licensed; contributions must be compatible.

## Audio and privacy

- Do not upload or commit personal voice recordings without explicit consent
  and a suitable redistribution license. Prefer reproducible synthetic fixtures.
- Do not add telemetry or audio-bearing network requests.
- Never commit API keys, tokens, or environment secrets.
- Label estimates and units honestly. Do not claim SPL calibration, clinical
  conclusions, mobile compatibility, or analysis accuracy without evidence.
- Keep sample processing and display updates outside React's render cycle.

## Documentation

Update requirements when product behavior changes. Record architectural
tradeoffs in `docs/architecture.md`; do not silently turn provisional defaults
or algorithm candidates into validated guarantees.
