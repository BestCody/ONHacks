# ONHacks

Standalone React/Vite registration site with an Express API and PostgreSQL storage.

## Project layout

- `src/pages/`: route-level pages (`Home`, `Apply`, authentication, and dashboard)
- `src/components/`: app-specific components
- `src/components/ui/`: reusable shadcn/Radix UI primitives
- `src/context/AuthContext.jsx`: session-aware frontend auth state
- `src/hooks/`: shared React hooks
- `src/lib/`: shared utilities
- `server/index.js`: Express API, database initialization, and static hosting
- `public/`: self-hosted images, video, and fonts

## Local development

1. Install Node.js 20 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a PostgreSQL database and copy `.env.example` to `.env`. Set
   `DATABASE_URL` to that database's connection string.
4. Start the API/server:

   ```bash
   npm start
   ```

5. In a second terminal, start Vite:

   ```bash
   npm run dev
   ```

Open the Vite URL, usually `http://localhost:5173`. Vite proxies `/api` to
the server on port `10000`.

### Preview inside VS Code

1. Open the Command Palette (`Ctrl+Shift+P`) and choose **Tasks: Run Task**.
2. Run **ONHacks: Start Vite preview**.
3. Open the Command Palette again and choose **Simple Browser: Show**.
4. Enter `http://127.0.0.1:5173/` or jump directly to the beach section with
   `http://127.0.0.1:5173/#partners`.

For registration and authentication requests, start `npm start` in a second
terminal as described above. The Vite preview remains the page you display in
VS Code.

The server creates the `applications`, `event_applications`, `users`, and `sessions` tables
automatically on startup. Accounts use salted scrypt password hashes and
HTTP-only database-backed session cookies.

Authentication routes are `/signup`, `/signin`, and the protected `/dashboard`.
The legacy `/register` and `/login` paths redirect to the corresponding auth
pages.

### Security baseline

- Helmet security headers and a self-hosted Content Security Policy are applied
  to every response.
- Production sessions use Secure, HttpOnly, SameSite, host-only cookies, and
  session tokens are stored hashed in PostgreSQL.
- State-changing API requests require a trusted same-origin request, while API
  responses are marked `no-store`.
- API, authentication, and application-submission endpoints have separate
  in-memory rate limits. If the service is scaled to multiple web instances,
  replace the default limiter store with a shared store.
- Request bodies and registration fields are size-limited and validated before
  parameterized database queries are executed.

## Deploy on Render

Use a Render **Web Service**, not a Static Site. The Express server serves the
compiled frontend and handles `/api/applications`.
It also handles account sessions and independent event applications through
`/api/auth/*` and `/api/event-applications`.

Use these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Create a Render PostgreSQL database in the same region as the web service,
then add its **Internal Database URL** to the web service as `DATABASE_URL`.
Also set `NODE_ENV=production`. The server creates the table on the first
successful boot.

`render.yaml` contains the web-service configuration. If you use Render's
Blueprint flow, connect the repository and provide the PostgreSQL connection
string when prompted for `DATABASE_URL`.
