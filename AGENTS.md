# HHMusic — Agent Guide

## Quick Start

```bash
npm install                       # install deps + postinstall auto-updates yt-dlp binary
# edit .env (copy .env.example)
npm start                         # node index.js (<1000 servers)
node shard.js                     # ShardingManager (>1000 servers)
npm test                          # node --check index.js (syntax check only — no test/lint/typecheck)
```

## Non-Obvious Facts

- **Startup delay**: `commandLoader.js` is `require`d immediately at line 115 for its side effect (registers slash commands via Discord REST API via `rest.put()`). Client creation is wrapped in `setTimeout(() => {...}, 5000)` to let commands register before connecting.
- **`ytdlp-exec.js` wrapper** (`src/ytdlp-exec.js`): Converts camelCase option keys to `--kebab-case`, resolves binary from `node_modules/youtube-dl-exec/bin/`. Used by YouTube and SoundCloud, NOT by DirectLink or `ytdl-core`.
- **YouTube auth strategy** (`src/YouTube.js:70-83`): 5-tier fallback:
  1. `cookiesFromBrowser` → `player_client=mweb`
  2. `cookiesFile` env → `player_client=mweb`
  3. `COOKIES_CONTENT` env (materialized to temp file via `fs.mkdtempSync`) → `player_client=mweb`
  4. `poToken` env (`YOUTUBE_PO_TOKEN` or `PO_TOKEN`) → `player_client=web` + `po_token`
  5. none of the above → `player_client=ios` (no auth)
  `jsRuntimes` set to `node:${process.execPath}` (not just `'node'`).
- **`COOKIES_CONTENT` env var** (`index.js:57-73`): Raw Netscape-format cookie string materialized to `cookiesFile` path at startup. Primary mechanism for Railway (non-persistent filesystem).
- **Cookies from platform secrets** (`index.js:78-106`): Render's `/etc/secrets/cookies.txt` auto-copied to configured `cookiesFile` or `/tmp/cookies.txt` as fallback.
- **`isLowMemory` hardcoded false** (`src/MusicPlayer.js:38`): Background track downloads always run so `play()` can fall back from failed streaming to a cached file.
- **Session recovery**: `PlayerStateManager` saves active players to `database/playerState.json` on graceful shutdown and restores them on restart (reconnects voice channels, resumes playback). In shard mode, restore is broadcast after 10s post-spawn delay (`shard.js:95`). Audio cache cleanup runs after restore.
- **Two SIGINT handlers** (`index.js`): A simple disconnect at line 501 and a full state-save in `init()` at line 610. The simple handler registers **first**, so it runs first on signal — the init handler's state save may race with connection teardown.
- **HTTP server on `PORT`** (`index.js:26-55`): Default 8080. Handles Spotify OAuth callback (`/spotify-callback`) and health checks (any other path → `200 OK`). Required for Railway/Fly.io to prevent container kill during 5s startup delay.
- **`global.clients` cross-reference** (`index.js:279-280`): `MusicEmbedManager` is set on `global.clients.musicEmbedManager` so `MusicPlayer.js` can access it without a client reference. Used extensively in `MusicPlayer.js` (lines 1180, 1424, 1807, etc.).
- **Spotify OAuth** (`src/Spotify.js`): Default redirect URI `http://127.0.0.1:3000/spotify-callback` (NOT `localhost` — Spotify rejects `localhost` for new apps). Override via `SPOTIFY_REDIRECT_URI` env. Refresh token persisted to `database/spotify_token.json` AND `SPOTIFY_REFRESH_TOKEN` env var. Falls back to client credentials grant when no refresh token exists.
- **Spotify playlist fetching** (`src/Spotify.js:221-270`): 3-tier — 1. `node-fetch` `GET /v1/playlists/{id}` with `Authorization` header (parses `meta.items`, uses `entry.item || entry.track`), 2. `spotify-web-api-node` npm lib, 3. web scrape (embed + main page with `__NEXT_DATA__`, `__INITIAL_STATE__`, `__next_f` data patterns).
- **Lyrics priority** (`src/LyricsManager.js:78-104`): **LRCLIB first**, then Genius (web scraping via `genius-lyrics` npm lib, no API key required). README says the opposite — code is source of truth. If both fail, no lyrics button appears.
- **Sharding config**: `TOTAL_SHARDS` (default `auto`), `SHARD_MODE` (`process`/`worker`), `SHARD_SPAWN_DELAY` (5500ms), `SHARD_SPAWN_TIMEOUT` (30000ms).
- **No test/linter/formatter/TypeScript** — pure CommonJS JavaScript. Only `node --check index.js` for validation.
- **Required Node.js**: `>=20.0.0` (package.json engines). Dockerfile uses `node:24-slim`.
- **ffmpeg bundled** via `ffmpeg-static` — no system install needed.
- **Postinstall hook** (`scripts/update-ytdlp.js`): Runs `yt-dlp -U` to update binary.
- **`database/` and `audio_cache/` are gitignored** — player state (`playerState.json`), language prefs (`languages.json` via `JsonDB`), Spotify tokens, and cached audio (`track_[MD5].opus`) are local-only.
- **Audio cache cleaned after session restore** (`index.js:118-176`): Deletes files under `audio_cache/` exceeding 200MB (oldest first). Protected files (currently downloading/playing) are skipped.
- **22 language packs** in `languages/` (ar, cs, da, de, en, es, fi, fr, hi, id, it, ja, ko, nl, no, pl, pt, ru, sv, tr, zh_CN, zh_TW).
- **`LanguageManager`** (`src/LanguageManager.js`): Uses `node-json-db` (`JsonDB`) for `database/languages.json`. Hot-loads every JSON in `languages/`. Singleton instance exported. Server language cached in-memory with `Map`.
- **`events/` directory**: Contains only 2 files — `buttonHandler.js` and `modalHandler.js`. All button/modal interactions are routed here by the `InteractionCreate` event.
- **Dockerfile**: `node:24-slim`, installs system python3 + ffmpeg, `NODE_OPTIONS=--max-old-space-size=384`, `EXPOSE 8080`.
- **Deployment**: `Dockerfile` for Railway.
- **Autoplay system**: Toggle via button or `/autoplay` command. 20 genres with duration filtering (30s–10min), keyword blocking, and smart search strategy per genre.
- **`config.js`** is the central config hub reading `.env` via `dotenv`. All config keys have fallback defaults.
