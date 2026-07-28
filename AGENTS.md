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

- **5-second startup delay** (`index.js:603`): `commandLoader.js` is `require`d at line 60 purely for its side effect (registers slash commands via Discord REST API), but the `Client` creation is wrapped in `setTimeout(() => {...}, 5000)` to let commands register before connecting.
- **`ytdlp-exec.js` wrapper** (`src/ytdlp-exec.js`): Converts camelCase option keys to `--kebab-case`, resolves binary from `node_modules/youtube-dl-exec/bin/`. Used by YouTube/SoundCloud/DirectLink, NOT by `ytdl-core`.
- **YouTube strategy** (`src/YouTube.js`): `player_client=tv,mweb,android_vr,visionos` always set via `extractorArgs`. PO Token added if `YOUTUBE_PO_TOKEN`/`PO_TOKEN` env var is set. Cookies loaded from browser/cookie file/Render secret `/etc/secrets/cookies.txt` are copied to `/tmp/hhmusic-cookies.txt` for write access. Streaming explicitly **deletes** cookies to avoid n-challenge.
- **`jsRuntimes: 'node'` required** (`src/YouTube.js:14`): yt-dlp 2026.07+ needs a JS runtime with logged-in cookies. Only Deno is auto-detected; add `jsRuntimes: 'node'` explicitly.
- **`COOKIES_CONTENT` env var** (`index.js:12-20`): If set, writes its content to the configured `cookiesFilePath` at startup — useful for platforms like Railway that can't mount a file.
- **Session recovery**: `PlayerStateManager` saves active players to `database/playerState.json` on graceful shutdown and restores them on restart (reconnects voice channels, resumes playback). In shard mode, restore is broadcast after a 10s post-spawn delay (`shard.js:95`).
- **Spotify OAuth flow** (`src/Spotify.js`): The bot runs an HTTP server on port 3000 to handle the OAuth callback. Use `http://127.0.0.1:3000/spotify-callback` (NOT `localhost` — Spotify rejects `localhost` for new apps). Refresh token persisted to `database/spotify_token.json` AND `SPOTIFY_REFRESH_TOKEN` env var.
- **Spotify API change (2025)**: For apps created after April 2025, `GET /v1/playlists/{id}/tracks` returns 403. Code fetches `GET /v1/playlists/{id}` directly via `node-fetch` with `Authorization` header, parses `meta.items` (top-level items array), and uses `entry.item || entry.track` (`src/Spotify.js:244`). Falls back to the `spotify-web-api-node` npm library.
- **Sharding config**: `TOTAL_SHARDS` (default `auto`), `SHARD_MODE` (`process`/`worker`), `SHARD_SPAWN_DELAY` (5500ms), `SHARD_SPAWN_TIMEOUT` (30000ms).
- **No test/linter/formatter/TypeScript** — pure CommonJS JavaScript. Only `node --check index.js` for validation.
- **Required Node.js**: `>=20.0.0` (enforced via `package.json` engines).
- **ffmpeg bundled** via `ffmpeg-static` — no system install needed.
- **Postinstall hook** (`scripts/update-ytdlp.js`): Runs `yt-dlp -U` to update binary. YouTube breaks older versions frequently.
- **`database/` and `audio_cache/` are gitignored** — player state, language prefs, Spotify tokens, and cached audio (`track_[MD5].opus`) are local-only.
- **Audio cache cleaned on startup** (`index.js:62-85`): Deletes files under `audio_cache/` exceeding 200MB until under limit.
- **22 language packs** in `languages/`.
- **Dockerfile**: `node:24-slim` base, installs system python3 + ffmpeg, `NODE_OPTIONS=--max-old-space-size=128` (keeps heap under 512MB — background download skipped when low memory detected), `EXPOSE 8080`.
- **Graceful shutdown** (`index.js:556-577`): On SIGINT/SIGTERM, saves all active player states before exiting.