# Deployment

The app is a static site with no backend. Build it, then serve `dist/` over HTTPS.

```sh
npm ci
npm run build
```

## Local preview

`npm run preview` serves the production build at <http://127.0.0.1:4173>. The
production service worker registers in this build, so it is also how you verify
offline loading locally:

1. Open the preview URL once while online and wait a moment for the service worker.
2. Reload once (this primes the asset cache), then disable your network.
3. Reload again; the application shell should still load. Microphone capture
   still requires permission and a live device, but requiring no network.

The development server (`npm run dev`) never registers the service worker.

## Hosting requirements

- **HTTPS is required** for microphone access except on `localhost`. A plain HTTP
  LAN address is not a secure context, even for local devices.
- Serve only the built `dist/` directory; do not publish the repository checkout.
- Static assets use content-hashed filenames, so long `Cache-Control` headers are
  safe for everything except `index.html` (serve it with `no-cache`).
- No server-side routes, environment-specific secrets, or build-step API access
  are needed.

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds and publishes the site whenever
`main` is updated, and can also be started manually from the Actions tab. In the
repository settings, set **Pages → Build and deployment → Source** to **GitHub
Actions**. The production build uses the `/voicelab/` project-site path, including
for service-worker registration and offline navigation.
The singer guide is a static page at `guide/index.html` under that same base path. Its
source is `public/guide/index.html`, which Vite copies to `dist/guide/index.html`.
The app's Help link uses Vite's base URL so it works both at the domain root
and under `/voicelab/`.

## Updates and the service worker

Navigation requests are network-first, so serving a new `index.html` (with new
hashed asset URLs) immediately updates returning visitors online. The cache name
in `public/sw.js` can be bumped if a forced cache purge is ever warranted.
The worker makes a best-effort attempt to cache the guide during installation.
If that fails, the app still works; opening the guide online also caches it.
