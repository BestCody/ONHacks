# OTHacks

Standalone React/Vite registration site with an Express API and PostgreSQL storage.

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

The server creates the `applications` table automatically on startup.

## Deploy on Render

Use a Render **Web Service**, not a Static Site. The Express server serves the
compiled frontend and handles `/api/applications`.

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
