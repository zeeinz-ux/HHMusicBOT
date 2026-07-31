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

- **Startup sequence** (`index.js`): `commandLoader.js` is `require`d at top level (index.js:115) for its side effect — registers slash commands via the Discord REST API. Client creation is wrapped in `setTimeout(..., 5000)` (index.js:640) to let command registration finish before connecting.
- **HTTP server on `PORT`** (index.js:26-55): Default 8080. Binds immediately so Railway/Fly.io don't kill the container during the 5s startup delay. `/spotify-callback?code=` handles Spotify OAuth; every other path → `200 OK` (health check).
- **`STATE_DIR` env var** (Railway volume): When set, `audio_cache/`, `database/playerState.json`, and `database/spotify_token.json` all live under it. **Gotcha:** `LanguageManager`'s `database/languages.json` (node-json-db) ignores `STATE_DIR` — it's always cwd-relative, and every shard shares it.
- **`ytdlp-exec.js` wrapper** (`src/ytdlp-exec.js`): Converts camelCase option keys to `--kebab-case`; resolves binary from `node_modules/youtube-dl-exec/bin/` (falls back to `bin/`). Used by YouTube, SoundCloud, and MusicPlayer's download path (MusicPlayer.js:624). NOT used by DirectLink (which uses `axios`). `ytdl-core` is an **unused** dependency — no source requires it.
- **YouTube auth strategy** (`src/YouTube.js` `getYtDlpOptions`), fallback order:
  1. `cookiesFromBrowser` → `extractorArgs=youtube:player_client=mweb`
  2. `cookiesFile` env → `player_client=mweb`
  3. `COOKIES_CONTENT` env → materialized to a `fs.mkdtempSync` temp file (yt-dlp has no `--cookies-stdin`) → `player_client=mweb`
  4. `poToken` env (`YOUTUBE_PO_TOKEN` or `PO_TOKEN`) → `player_client=web` + `po_token` (format `web+TOKEN`)
  5. none of the above → `player_client=ios` (no auth)
  `jsRuntimes` is `node:${process.execPath}` (not just `'node'`). `getStream()` additionally tries formats (`ba/b`, `bestaudio`, `worstaudio`, `worst`) × clients (default, `android`, `tv,mweb`) until bytes flow — so format/client failures below the top tier are expected log noise.
- **`COOKIES_CONTENT` env var** (index.js:58-73): Raw Netscape cookie string written to `config.ytdl.cookiesFile` (or `./cookies.txt`) at startup — the primary Railway mechanism since its filesystem isn't persistent. Render's `/etc/secrets/cookies.txt` is auto-copied to `cookiesFile` or `/tmp/cookies.txt`.
- **`isLowMemory` hardcoded false** (`src/MusicPlayer.js:40`): Background track downloads always run so the play() fallback can switch from failed streaming to a cached file.
- **Session recovery**: `PlayerStateManager` persists active players to `database/playerState.json` on graceful shutdown and restores them on restart (reconnects voice, resumes playback). In shard mode, restore is broadcast after a 10s post-spawn delay (`shard.js:95`). Audio cache cleanup runs after restore (`restoreSessions`, index.js:378-383).
- **SIGINT vs SIGTERM gotcha**: There are two SIGINT handlers — a simple disconnect registered first (index.js:505, inside the startup timeout, before `init()` runs) that calls `process.exit(0)` immediately, and the state-saving graceful shutdown in `init()` (index.js:613) registered later. So on SIGINT the simple handler fires first and the graceful save is likely skipped; SIGTERM (what Docker/Railway sends) reliably saves state.
- **Spotify OAuth** (`src/Spotify.js`): Redirect URI `http://127.0.0.1:3000/spotify-callback` (NOT `localhost` — Spotify rejects it for new apps), override via `SPOTIFY_REDIRECT_URI`. Refresh token saved to `database/spotify_token.json`; read back from `SPOTIFY_REFRESH_TOKEN` env first (Railway persistence). Falls back to client credentials grant when no refresh token exists.
- **Spotify API change (2025)**: For apps created after April 2025, `GET /v1/playlists/{id}/tracks` returns 403. Code fetches `GET /v1/playlists/{id}` via `node-fetch` with `Authorization: Bearer`, parses top-level `meta.items`, uses `entry.item || entry.track`. Falls back to `spotify-web-api-node`, then web scrape (embed page / `__NEXT_DATA__`).
- **Sharding config** (`config.js` → `shard.js`): `TOTAL_SHARDS` (default `auto`), `SHARD_LIST`, `SHARD_MODE` (`process`/`worker`), `SHARD_RESPAWN`, `SHARD_SPAWN_DELAY` (5500ms), `SHARD_SPAWN_TIMEOUT` (30000ms).
- **No test/linter/formatter/TypeScript** — pure CommonJS. `npm test` = `node --check index.js` only. To validate changed files, run `node --check <file>` (e.g. `node --check src/YouTube.js`) — that's the de-facto verification practice.
- **Required Node.js**: `>=20.0.0` (package.json engines). Dockerfile uses `node:24-slim` + system python3 + ffmpeg, `NODE_OPTIONS=--max-old-space-size=384`, `EXPOSE 8080`.
- **ffmpeg bundled** via `ffmpeg-static` — no system install needed (Dockerfile installs ffmpeg anyway).
- **Postinstall hook** (`scripts/update-ytdlp.js`): Runs `yt-dlp -U` to update the binary; exit code 1 after an update is treated as success.
- **Gitignored**: `database/`, `audio_cache/`, `cookies.txt`, `.env`, `.claude/`.
- **Audio cache**: `track_[MD5].opus` files. Cleanup is **startup-only** (no periodic job) and runs after session restore: deletes oldest-first once total exceeds **80MB** (`MAX_CACHE_MB`, index.js:121), skipping files in `PlayerStateManager.getProtectedCacheFiles()` (currently downloading/playing).
- **22 language packs** in `languages/`. `LanguageManager` hot-loads every JSON file; guild prefs live in `database/languages.json` via node-json-db.
- **Autoplay**: Toggle via the 🎲 button or `/autoplay` (both just set `player.autoplay = 'related'` — no genre picker). When the queue ends, `MusicPlayer.handleAutoplay` first grabs YouTube related videos from the **last played track**, falling back to a search by that track's **artist name**, then to generic `music official video` / `top songs ${currentYear}` keywords. Filters 30s–600s and blocks tutorial/podcast/etc. titles. (The old genre-select menu and `genres.*`/`autoplay_genre` keys are dead code; `genres.*` translations still exist in the language files unused.)