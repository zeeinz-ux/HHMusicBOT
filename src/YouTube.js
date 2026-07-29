const youtubedl = require('./ytdlp-exec');
const config = require('../config');
const LanguageManager = require('./LanguageManager');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DIAGNOSTIC: this runs once when YouTube.js is first loaded
console.log(`[YOUTUBE-MODULE-LOADED] YouTube.js loaded, binary=${youtubedl.binaryPath}, exists=${fs.existsSync(youtubedl.binaryPath)}`);

// Materialize COOKIES_CONTENT (a raw cookie string from env vars) to a temp file
// once per process. Returns the path. Used on Railway / Render / other hosts
// where cookies can't live on disk and must be passed via env vars.
//
// yt-dlp has no `--cookies-stdin`, so we have to write to a file. We do this
// lazily and cache the path so we only pay the cost once.
let _cookiesContentPath = null;
function materializeCookiesContent() {
    if (_cookiesContentPath) return _cookiesContentPath;
    const content = process.env.COOKIES_CONTENT;
    if (!content || !content.trim()) return null;
    try {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hhmusic-'));
        const p = path.join(dir, 'cookies.txt');
        fs.writeFileSync(p, content, 'utf8');
        _cookiesContentPath = p;
        console.log(`[YouTube] COOKIES_CONTENT written to ${p}`);
        return p;
    } catch (e) {
        console.error('[YouTube] Failed to write COOKIES_CONTENT to temp file:', e.message);
        return null;
    }
}

class YouTube {
    // yt-dlp için ortak parametreleri döndüren yardımcı fonksiyon
    static getYtDlpOptions(extraOptions = {}) {
        const baseOptions = {
            noCheckCertificates: true,
            noWarnings: true,
            retries: 3,
            fragmentRetries: 3,
            noCacheDir: true,
            jsRuntimes: `node:${process.execPath}`,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            ],
            ...extraOptions
        };

        // Auth priority: Cookies (browser/file/content) > PO Token > iOS client (no auth needed)
        // Only applied when caller didn't explicitly pass extractorArgs (for fallback cycling).
        const envCookiesPath = materializeCookiesContent();
        if (!baseOptions.extractorArgs) {
            if (config.ytdl.cookiesFromBrowser) {
                baseOptions.cookiesFromBrowser = config.ytdl.cookiesFromBrowser;
                baseOptions.extractorArgs = 'youtube:player_client=mweb';
            } else if (config.ytdl.cookiesFile) {
                baseOptions.cookies = config.ytdl.cookiesFile;
                baseOptions.extractorArgs = 'youtube:player_client=mweb';
            } else if (envCookiesPath) {
                baseOptions.cookies = envCookiesPath;
                baseOptions.extractorArgs = 'youtube:player_client=mweb';
            } else if (config.ytdl.poToken) {
                baseOptions.extractorArgs = `youtube:po_token=web+${config.ytdl.poToken};player_client=web`;
            } else {
                baseOptions.extractorArgs = 'youtube:player_client=ios';
            }
        } else {
            // Fallback client — strip all auth (cookies / PO token) so yt-dlp
            // tries the given client without any session baggage.
            delete baseOptions.cookiesFromBrowser;
            delete baseOptions.cookies;
            console.log(`[YouTube] Fallback client: ${baseOptions.extractorArgs} (no auth)`);
        }

        if (config.ytdl.proxy) {
            baseOptions.proxy = config.ytdl.proxy;
        }

        return baseOptions;
    }

    // Logs the bundled yt-dlp binary path + version once per process.
    static _loggedBinaryVersion = false;
    static async _logBinaryVersionOnce() {
        if (this._loggedBinaryVersion) return;
        this._loggedBinaryVersion = true;
        const youtubedl = require('./ytdlp-exec');
        const bin = youtubedl.binaryPath;
        const fs = require('fs');
        const exists = fs.existsSync(bin);
        console.log(`[YouTube] yt-dlp binary: ${bin} ${exists ? '✓ exists' : '✗ NOT FOUND'}`);
        if (exists) {
            try {
                const { execFileSync } = require('child_process');
                const ver = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
                console.log(`[YouTube] yt-dlp binary version: ${ver}`);
            } catch (e) {
                console.warn(`[YouTube] Could not detect yt-dlp binary version: ${e.message}`);
            }
        }
    }

    static async search(query, limit = 1, guildId = null) {
        try {
            await this._logBinaryVersionOnce();

            // If it's already a YouTube URL, get info directly
            if (this.isYouTubeURL(query)) {
                const info = await this.getInfo(query, guildId);
                return info ? [info] : [];
            }

            // Use yt-dlp for YouTube search
            const searchQuery = `ytsearch${limit}:${query}`;

            const results = await youtubedl(searchQuery, this.getYtDlpOptions({
                dumpSingleJson: true,
                flatPlaylist: true,
            }));

            if (!results || !results.entries) {

                return [];
            }

            const tracks = [];
            for (const item of results.entries.slice(0, limit)) {
                try {
                    // Debug: log item structure


                    const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
                    const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

                    const track = {
                        title: item.title || item.fulltitle || unknownTitle,
                        artist: item.uploader || item.channel || unknownArtist,
                        url: item.webpage_url || item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null),
                        duration: item.duration || 0,
                        thumbnail: item.thumbnail,
                        platform: 'youtube',
                        type: 'track',
                        id: item.id,
                        views: item.view_count,
                        uploadDate: item.upload_date,
                        description: item.description,
                    };

                    // If duration is missing from search, try to get it from getInfo
                    if (!track.duration || track.duration === 0) {

                        const detailedInfo = await this.getInfo(track.url, guildId);
                        if (detailedInfo && detailedInfo.duration) {
                            track.duration = detailedInfo.duration;

                        }
                    }

                    tracks.push(track);
                } catch (error) {
                    continue;
                }
            }


            return tracks;

        } catch (error) {
            console.error('[YouTube] search() failed:', error.message || error);
            return [];
        }
    }

    static async getInfo(url, guildId = null) {
        try {
            await this._logBinaryVersionOnce();

            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                preferFreeFormats: true,
                format: 'ba/b',
            }));

            if (!info) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_info_returned') : 'No info returned from youtube-dl';
                throw new Error(errorMsg);
            }

            const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
            const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

            const track = {
                title: info.title || unknownTitle,
                artist: info.uploader || info.channel || unknownArtist,
                url: info.webpage_url || url,
                duration: info.duration || 0,
                thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
                platform: 'youtube',
                type: 'track',
                id: info.id,
                views: info.view_count,
                uploadDate: info.upload_date,
                description: info.description,
                formats: info.formats,
            };


            return track;

        } catch (error) {
            console.error('[YouTube] getInfo() failed:', error.message || error);
            return null;
        }
    }

    static async _spawnStreamProc(url, extraFlags) {
        const { spawn } = require('child_process');
        console.log(`[YT-SPAWN] _spawnStreamProc url=${url?.substring(0, 60)} extra=${JSON.stringify(extraFlags)}`);
        const flags = this.getYtDlpOptions({ output: '-', format: 'ba/b', ...extraFlags });
        const args = [url];
        for (const [key, val] of Object.entries(flags)) {
            if (val === false || val === null || val === undefined) continue;
            const k = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
            if (val === true) {
                args.push(`--${k}`);
            } else if (Array.isArray(val)) {
                for (const v of val) args.push(`--${k}`, String(v));
            } else {
                args.push(`--${k}`, String(val));
            }
        }
        const proc = spawn(youtubedl.binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderrTail = '';
        let stdoutBytes = 0;
        proc.stderr.on('data', d => {
            stderrTail = (stderrTail + d.toString()).split('\n').slice(-5).join('\n').trim();
        });
        proc.stdout.on('data', d => { stdoutBytes += d.length; });

        const result = await new Promise(resolve => {
            let settled = false;
            const finish = p => { if (!settled) { settled = true; resolve(p); } };
            proc.on('close', code => finish({ kind: 'close', code, stdoutBytes }));
            proc.on('error', err => finish({ kind: 'error', err, stdoutBytes }));
            const timer = setTimeout(() => finish({ kind: 'timeout', stdoutBytes }), 15000);
            proc.stdout.on('data', () => { clearTimeout(timer); finish({ kind: 'data', proc }); });
        });

        return { result, proc, stderrTail };
    }

    static async getStream(url, guildId = null, startSeconds = 0) {
        try {
            await this._logBinaryVersionOnce();

            if (!url) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.url_required') : 'URL is required';
                throw new Error(errorMsg);
            }

            // Check yt-dlp binary exists
            const binPath = youtubedl.binaryPath;
            const fs = require('fs');
            if (!fs.existsSync(binPath)) {
                console.error(`[YouTube.getStream] yt-dlp binary NOT FOUND at: ${binPath}`);
                throw new Error(`yt-dlp binary not found at ${binPath}`);
            }
            console.log(`[YouTube.getStream] yt-dlp binary: ${binPath}`);

            // Get metadata first (dumpSingleJson) — also validates the URL works
            const info = await youtubedl(url, this.getYtDlpOptions({ dumpSingleJson: true }));
            if (!info) {
                throw new Error('yt-dlp returned no info');
            }

            const duration = info?.duration || 0;
            const bitrate = info?.abr || info?.tbr || 0;
            const acodec = info?.acodec || 'unknown';

            console.log(`[YouTube.getStream] URL resolved — acodec: ${acodec}, duration: ${duration}s, bitrate: ${bitrate}k, title: "${info.title}"`);

            // GH#critical: prefer explicit Opus transcoding via yt-dlp's bundled
            // postprocessor instead of relying on whatever container the source
            // uses (mp4/m4a vs webm/opus vs fragmented DASH segments). When
            // `audioFormat` is 'opus', yt-dlp always emits Opus-in-WebM to
            // stdout — a stable container we can hand to prism-media FFmpeg
            // (or to Discord's StreamType.WebmOpus) without probing gymnastics.
            const formatCandidates = [
                { fmt: 'ba/b', audioFormat: 'opus' },
                { fmt: 'ba/b' },
                { fmt: 'bestaudio', audioFormat: 'opus' },
                { fmt: 'bestaudio' },
                { fmt: 'worstaudio', audioFormat: 'opus' },
                { fmt: 'worstaudio' },
            ];
            // Client fallbacks — if the default auth (iOS/web) fails, try android then tv
            const clientFallbacks = [
                { label: 'default' },                              // as-is from getYtDlpOptions
                { label: 'android', extractorArgs: 'youtube:player_client=android' },
                { label: 'tv,mweb', extractorArgs: 'youtube:player_client=tv,mweb' },
            ];

            let stream = null;
            let streamFormat = null;
            let usedClient = null;

            for (const clientCfg of clientFallbacks) {
                for (const { fmt, audioFormat } of formatCandidates) {
                    const extra = { format: fmt };
                    if (audioFormat) extra.audioFormat = audioFormat;
                    if (clientCfg.extractorArgs) extra.extractorArgs = clientCfg.extractorArgs;

                    console.log(`[YouTube.getStream] Try client="${clientCfg.label}" format="${fmt}"${audioFormat ? ` audioFormat="${audioFormat}"` : ''}...`);
                    const { result, proc, stderrTail } = await this._spawnStreamProc(url, extra);

                    if (result.kind === 'data') {
                        console.log(`[YouTube.getStream] ✓ client="${clientCfg.label}" format="${fmt}"${audioFormat ? ` audioFormat="${audioFormat}"` : ''} — data flowing`);
                        stream = proc;
                        streamFormat = audioFormat ? `${fmt}+${audioFormat}` : fmt;
                        usedClient = clientCfg.label;
                        break;
                    }

                    console.warn(`[YouTube.getStream] ✗ client="${clientCfg.label}" format="${fmt}"${audioFormat ? ` audioFormat="${audioFormat}"` : ''} → ${result.kind}${result.code !== undefined ? ` (code ${result.code})` : ''} stderr:\n${stderrTail || '(empty)'}`);
                    try { proc.kill(); } catch {}
                }
                if (stream) break;
            }

            if (!stream) {
                throw new Error('All format/client combinations failed. YouTube likely blocked on this IP — set COOKIES_CONTENT or a PO_TOKEN in .env');
            }

            console.log(`[YouTube.getStream] Stream ready — client=${usedClient}, format=${streamFormat}`);

            // We requested Opus transcoding above (or got native Opus from the
            // source). Either way, yt-dlp always emits Opus-in-WebM for stdout
            // when `audioFormat` is set. Pass the raw stdout through and let
            // prism-media FFmpeg + StreamType.WebmOpus handle decoding.
            return {
                stream: stream.stdout,
                url: null,
                rawUrl: null,
                type: 'webm/opus',
                container: 'webm',
                duration,
                bitrate,
                canSeek: false,
                format: streamFormat,
                httpHeaders: {}
            };

        } catch (error) {
            console.error(`[YouTube.getStream] FAILED: ${error.message}`);
            throw error;
        }
    }

    static async getPlaylist(url, guildId = null) {
        try {

            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                flatPlaylist: true,
            }));

            if (!info) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_playlist_info') : 'No playlist info found';
                throw new Error(errorMsg);
            }

            if (!info.entries || info.entries.length === 0) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_playlist_entries') : 'No playlist entries found';
                throw new Error(errorMsg);
            }

            const unknownTitle = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_title') : 'Unknown Title';
            const unknownArtist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_artist') : 'Unknown Artist';

            const tracks = [];
            for (const entry of info.entries.slice(0, config.bot.maxPlaylistSize)) {
                if (entry && (entry.id || entry.url)) {
                    try {
                        const track = {
                            title: entry.title || entry.fulltitle || unknownTitle,
                            artist: entry.uploader || entry.channel || entry.uploader_id || unknownArtist,
                            url: entry.webpage_url || entry.url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null),
                            duration: entry.duration || 0,
                            thumbnail: entry.thumbnail || entry.thumbnails?.[0]?.url,
                            platform: 'youtube',
                            type: 'track',
                            id: entry.id,
                        };

                        if (track.url) {
                            tracks.push(track);
                        }
                    } catch (entryError) {
                        continue;
                    }
                }
            }

            if (tracks.length === 0) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.no_valid_tracks') : 'No valid tracks found in playlist';
                throw new Error(errorMsg);
            }

            const unknownPlaylist = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.unknown_playlist') : 'Unknown Playlist';

            return {
                title: info.title || unknownPlaylist,
                tracks: tracks,
                totalTracks: info.playlist_count || tracks.length,
                url: url,
                platform: 'youtube',
                type: 'playlist',
            };

        } catch (error) {
            console.error('[YouTube] getPlaylist() failed:', error.message || error);
            return null;
        }
    }

    static isYouTubeURL(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/playlist\?list=)/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
            /^https?:\/\/(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]+/,
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    static isPlaylist(url) {
        return url.includes('list=') &&
            (url.includes('youtube.com/playlist') ||
                url.includes('youtube.com/watch') ||
                url.includes('youtu.be'));
    }

    static parseDuration(durationString) {
        if (!durationString) return 0;

        // Handle formats like "3:45", "1:23:45", etc.
        const parts = durationString.split(':').reverse();
        let seconds = 0;

        for (let i = 0; i < parts.length; i++) {
            seconds += parseInt(parts[i]) * Math.pow(60, i);
        }

        return seconds;
    }

    static formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';

        // Ensure we work with integers to avoid floating point errors
        const totalSeconds = Math.floor(Number(seconds) || 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    static async getRelatedVideos(videoId, limit = 5) {
        try {
            // This would implement getting related videos
            // For now, return empty array as YouTube API v3 doesn't provide related videos

            return [];
        } catch (error) {
            return [];
        }
    }

    static extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]+)/,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    static extractPlaylistId(url) {
        const match = url.match(/[&?]list=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    static createThumbnailUrl(videoId, quality = 'maxresdefault') {
        return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    }

    static createVideoUrl(videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    static async validateUrl(url) {
        try {
            if (!this.isYouTubeURL(url)) {
                return false;
            }

            // Try to get basic info to validate
            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
                skipDownload: true,
            }));

            return !!info && !!info.title;
        } catch (error) {
            return false;
        }
    }

    static async getRelated(url, guildId = null) {
        try {
            await this._logBinaryVersionOnce();
            const info = await youtubedl(url, this.getYtDlpOptions({
                dumpSingleJson: true,
            }));

            // Extract related video URLs from yt-dlp metadata
            const related = (info?.related || [])
                .filter(v => v && v.url && v.title)
                .slice(0, 15)
                .map(v => ({
                    title: v.title,
                    url: v.url,
                    duration: v.duration || 0,
                    thumbnail: v.thumbnail || this.createThumbnailUrl(this.extractVideoId(v.url)),
                    platform: 'youtube',
                    artist: v.uploader || v.channel || 'Unknown'
                }));

            // Fallback: if no related videos, use playlist entries or similar
            if (related.length === 0 && info?.playlist && Array.isArray(info.playlist)) {
                return info.playlist
                    .filter(v => v && v.url && v.title && v.url !== url)
                    .slice(0, 15)
                    .map(v => ({
                        title: v.title,
                        url: v.url,
                        duration: v.duration || 0,
                        thumbnail: v.thumbnail || this.createThumbnailUrl(this.extractVideoId(v.url)),
                        platform: 'youtube',
                        artist: v.uploader || v.channel || 'Unknown'
                    }));
            }

            return related;
        } catch (error) {
            console.error('[YouTube] getRelated() failed:', error.message || error);
            return [];
        }
    }
}

module.exports = YouTube;
