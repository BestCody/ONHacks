# AGENTS.md

## Project Context

This is a standalone React/Vite application with an Express API and PostgreSQL
database. Keep changes focused on the user's request and preserve the current
visual design and API conventions.

## Key Files

- `Home.jsx` and `Apply.jsx`: primary public pages.
- `server.js`: Express server, API routes, database initialization, and static
  frontend hosting.
- `vite.config.js`: Vite build and local `/api` proxy configuration.
- `render.yaml`: Render Web Service settings.
- `.env.example`: local environment variable template. Never commit `.env` or
  production secrets.

## Development

- Run `npm install` after dependency changes.
- Run `npm run dev:server` for the API and `npm run dev` for Vite.
- Run `npm run build` before handing off deployment changes.
- `DATABASE_URL` is required for registration writes and for production.
