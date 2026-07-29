# HHMusic — Agent Guide

## Quick Start

```bash
npm install                       # install deps + auto-updates yt-dlp binary (postinstall)
# edit .env (copy .env.example)
npm start                         # node index.js (<1000 servers)
node shard.js                     # ShardingManager (>1000 servers)
npm test                          # node --check index.js (syntax check only — no test framework)
```

## Non-Obvious Facts

- **Startup delay**: `commandLoader.js` is `require`d immediately for its side effect (registers slash commands via Discord REST API). Client creation is wrapped in `setTimeout(() => {...}, 5000)` to let commands register before connecting.
- **`ytdlp-exec.js` wrapper** (`src/ytdlp-exec.js`): Converts camelCase option keys to `--kebab-case`, resolves binary from `node_modules/youtube-dl-exec/bin/`. Used by YouTube and SoundCloud, NOT by DirectLink or `ytdl-core`.
- **YouTube auth strategy** (`src/YouTube.js`): 4-tier fallback:
  1. `cookiesFromBrowser` → `player_client=mweb`
  2. `cookiesFile` env → `player_client=mweb`
  3. `COOKIES_CONTENT` env (materialized to temp file via `fs.mkdtempSync`) → `player_client=mweb`
  4. `poToken` env (`YOUTUBE_PO_TOKEN` or `PO_TOKEN`) → `player_client=web` + `po_token`
  5. none of the above → `player_client=ios` (no auth)
  `jsRuntimes` set to `node:${process.execPath}` at line 41 (not just `'node'`). Render's `/etc/secrets/cookies.txt` is copied to `cookiesFile` or `/tmp/cookies.txt` in `index.js` for portability — Railway users don't need this path since `COOKIES_CONTENT` is the primary mechanism there.
- **`COOKIES_CONTENT` env var** (`index.js`): Raw cookie string materialized to `cookiesFile` path at startup — primary mechanism for Railway since Railway's filesystem isn't persistent across deploys and secret files can't be mounted like Render's `/etc/secrets`.
- **`isLowMemory` hardcoded false** (`src/MusicPlayer.js:39`): Background track downloads always run so the play() fallback can switch from failed streaming to a cached file.
- **Session recovery**: `PlayerStateManager` saves active players to `database/playerState.json` on graceful shutdown and restores them on restart (reconnects voice channels, resumes playback). In shard mode, restore is broadcast after a 10s post-spawn delay (`shard.js:95`). Audio cache cleanup runs after restore.
- **HTTP server on `PORT`** (`index.js:15-44`): Default port 8080. Handles Spotify OAuth callback (`/spotify-callback`) and health checks (any other path → `200 OK`). Required for Railway/Fly.io so the platform doesn't kill the container during the 5s startup delay.
- **Spotify OAuth** (`src/Spotify.js`): Default redirect URI `http://127.0.0.1:3000/spotify-callback` (NOT `localhost` — Spotify rejects `localhost` for new apps). Override via `SPOTIFY_REDIRECT_URI` env. Refresh token persisted to `database/spotify_token.json` AND `SPOTIFY_REFRESH_TOKEN` env var. Runs client credentials grant when no refresh token exists.
- **Spotify API change (2025)**: For apps created after April 2025, `GET /v1/playlists/{id}/tracks` returns 403. Code fetches `GET /v1/playlists/{id}` via `node-fetch` with `Authorization` header, parses `meta.items` (top-level items array), uses `entry.item || entry.track`. Falls back to `spotify-web-api-node` npm lib, then web scrape.
- **Sharding config**: `TOTAL_SHARDS` (default `auto`), `SHARD_MODE` (`process`/`worker`), `SHARD_SPAWN_DELAY` (5500ms), `SHARD_SPAWN_TIMEOUT` (30000ms).
- **No test/linter/formatter/TypeScript** — pure CommonJS JavaScript. Only `node --check index.js` for validation.
- **Required Node.js**: `>=20.0.0` (package.json engines). Dockerfile uses `node:24-slim`.
- **ffmpeg bundled** via `ffmpeg-static` — no system install needed.
- **Postinstall hook** (`scripts/update-ytdlp.js`): Runs `yt-dlp -U` to update binary.
- **`database/` and `audio_cache/` are gitignored** — player state, language prefs, Spotify tokens, and cached audio (`track_[MD5].opus`) are local-only.
- **Audio cache cleaned after session restore** (`index.js:357`): Deletes files under `audio_cache/` exceeding 200MB (oldest first). Protected files (currently downloading/playing) are skipped.
- **22 language packs** in `languages/`.
- **Dockerfile**: `node:24-slim`, installs system python3 + ffmpeg, `NODE_OPTIONS=--max-old-space-size=384`, `EXPOSE 8080`.
- **Deployment**: `Dockerfile` for Railway.
- **Graceful shutdown**: `SIGINT`/`SIGTERM` in `init()` saves all active player states before exiting. There are actually two SIGINT handlers (a simple disconnect at top level and the full save in `init`) — the init handler runs first due to registration order.
- **Autoplay system**: Toggle via button or `/autoplay` command. 20 genres with duration filtering (30s–10min), keyword blocking, and smart search strategy per genre.