# geometry-sequencer-v2

Version 2 of the Sacred Geometry Sequencer. Shares the Supabase backend (users, projects, folders) with v1 but iterates independently.

- v1 repo: https://github.com/ianbrewer/geometry-app-keyframes
- Schema and migrations are owned by the v1 repo — do not add a `supabase/migrations/` folder here.

## Setup

```
cd App
npm install
npm run dev
```

Requires environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY`

## Netlify

Production: https://geometry-sequencer-v2.netlify.app

The root `netlify.toml` builds `App/` with Node.js 24 and publishes `App/dist`.
The Netlify site is connected to this repository with production branch `main`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in Netlify's environment
variables, with the Builds scope. Preserve the values and environment-specific
overrides from Vercel for production, deploy previews, and branch deploys.
These two variables are embedded in the browser bundle; use the Supabase anon
or publishable key, never the service-role key. Rebuild after changing values.

Before switching users to the Netlify URL, add that exact origin to the
Supabase Auth redirect allowlist for project `ttalbvgdxtnyppighwgf`. Keep the
existing v1 and v2 URLs and the shared Site URL: v1 still uses this backend.
Signup and password-reset emails already request `window.location.origin`.

Verify sign-in, email redirects, project loading and saving, asset uploads,
and exports on Netlify before retiring Vercel. The committed player bundles
in `App/public/` are included in the deployment. No database or storage
migration is required for this hosting change.
