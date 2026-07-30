const youtubedl = require('./ytdlp-exec');
const config = require('../config');
const LanguageManager = require('./LanguageManager');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DIAGNOSTIC: this runs once when YouTube.js is first loaded
console.log(`[YOUTUBE-MODULE-LOADED] YouTube.js loaded, binary=${youtubedl.binaryPath}, exists=${fs.existsSync(youtubedl.binaryPath)}`);

// Materialize COOKIES_CONTENT (a raw cookie string from env vars) to a temp file
// once per process. Returns the path. Used on Railway (and similar cloud hosts)
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
            retries: 10,
            fragmentRetries: 10,
            extractorRetries: 5,
            socketTimeout: 60,
            noCacheDir: true,
            jsRuntimes: `node:${process.execPath}`,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            ],
            ...extraOptions
        };

        // Cookies (browser or file) → verified working combo is player_client=mweb.
        //   `web` client alone returns an empty format list without a valid PO token,
        //   and `tv` returns formats but 403s the actual download. mweb downloads cleanly
        //   with the same cookies file. Cookies are more stable than PO tokens (weeks
        //   vs hours) so they're preferred when available.
        //
        // COOKIES_CONTENT env var → raw cookie string used on Railway (and similar
        //   cloud hosts) where the filesystem isn't persistent and cookies must be
        //   passed via env vars. We materialize it to a temp file because yt-dlp
        //   has no stdin-cookies option.
        //
        // PO Token → demands player_client=web (which requires the token to work).
        //   Correct format: youtube:po_token=web+TOKEN;player_client=web
        //   Used as a fallback if no cookies are configured.
        //
        // iOS client → works on server IPs without ANY cookies or PO token.
        //   Last-resort fallback when neither cookies nor PO token are available.
        const envCookiesPath = materializeCookiesContent();
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
        let onData, onBytes;
        proc.stderr.on('data', d => {
            stderrTail = (stderrTail + d.toString()).split('\n').slice(-5).join('\n').trim();
        });

        const result = await new Promise(resolve => {
            let settled = false;
            const finish = p => { if (!settled) { settled = true; resolve(p); } };
            proc.on('close', code => finish({ kind: 'close', code, stdoutBytes }));
            proc.on('error', err => finish({ kind: 'error', err, stdoutBytes }));
            const timer = setTimeout(() => finish({ kind: 'timeout', stdoutBytes }), 30000);
            onData = () => { clearTimeout(timer); finish({ kind: 'data', proc }); };
            onBytes = d => { stdoutBytes += d.length; };
            proc.stdout.on('data', onData);
            proc.stdout.on('data', onBytes);
        });

        // Detach ALL data listeners so the first chunk isn't lost — the
        // caller (getStream → play()) will attach its own pipeline.
        if (result.kind === 'data') {
            if (onData) proc.stdout.removeListener('data', onData);
            if (onBytes) proc.stdout.removeListener('data', onBytes);
        }

        return { result, proc, stderrTail };
    }

    static async getStream(url, guildId = null, startSeconds = 0, opts = {}) {
        try {
            await this._logBinaryVersionOnce();

            if (!url) {
                const errorMsg = guildId ? await LanguageManager.getTranslation(guildId, 'youtube.url_required') : 'URL is required';
                throw new Error(errorMsg);
            }

            // `silent=true` is used by the preloader so it doesn't spam the logs
            // for every queued track. Callers that need to see what happened
            // (e.g. /play) leave it false (the default).
            const silent = opts.silent === true;

            // Get metadata first (dumpSingleJson) — also validates the URL works
            const info = await youtubedl(url, this.getYtDlpOptions({ dumpSingleJson: true }));
            if (!info) {
                throw new Error('yt-dlp returned no info');
            }

            const duration = info?.duration || 0;
            const bitrate = info?.abr || info?.tbr || 0;
            const acodec = info?.acodec || 'unknown';

            if (!silent) {
                console.log(`[YouTube.getStream] URL resolved — acodec: ${acodec}, duration: ${duration}s, bitrate: ${bitrate}k, title: "${info.title}"`);
            }

            // Try combinations: formats × client fallback.
            // Different YouTube player clients return different format lists and the
            // first one that produces audio bytes wins. With cookies, the default
            // (mweb) usually works; if not, fall back to android then tv.
            const formatCandidates = ['ba/b', 'bestaudio', 'worstaudio', 'worst'];
            const clientFallbacks = [
                { label: 'default' },                              // whatever getYtDlpOptions picked
                { label: 'android', extractorArgs: 'youtube:player_client=android' },
                { label: 'tv,mweb', extractorArgs: 'youtube:player_client=tv,mweb' },
            ];

            let stream = null;
            let streamFormat = null;
            let usedClient = null;

            for (const clientCfg of clientFallbacks) {
                for (const fmt of formatCandidates) {
                    const extra = clientCfg.extractorArgs
                        ? { extractorArgs: clientCfg.extractorArgs, format: fmt }
                        : { format: fmt };

                    const { result, proc, stderrTail } = await this._spawnStreamProc(url, extra);

                    if (result.kind === 'data') {
                        if (!silent) {
                            console.log(`[YouTube.getStream] client="${clientCfg.label}" format="${fmt}" — data flowing`);
                        }
                        stream = proc;
                        streamFormat = fmt;
                        usedClient = clientCfg.label;
                        break;
                    }

                    // Silence expected fallbacks — only log unexpected errors
                    // (exit codes other than 0/1, actual error events).
                    if (result.kind === 'error' ||
                        (result.kind === 'close' && result.code && result.code > 1)) {
                        const reason = result.kind === 'close'
                            ? `exit code ${result.code}`
                            : `error: ${result.err?.message || 'unknown'}`;
                        const errTail = stderrTail ? stderrTail.split('\n').filter(Boolean).slice(-2).join(' | ') : '';
                        console.warn(`[YouTube.getStream] ${clientCfg.label}/${fmt} → ${reason}${errTail ? ` [${errTail}]` : ''}`);
                    }
                    try { proc.kill(); } catch {}
                }
                if (stream) break;
            }

            if (!stream) {
                throw new Error('All format/client combinations failed. YouTube likely blocked this IP — set COOKIES_CONTENT or a PO_TOKEN in env.');
            }

            if (!silent) {
                console.log(`[YouTube.getStream] Stream ready — client=${usedClient}, format=${streamFormat}`);
            }

            return {
                stream: stream.stdout,
                url: null,
                rawUrl: null,
                type: acodec?.includes('opus') ? 'opus' : 'arbitrary',
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
