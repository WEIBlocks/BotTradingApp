import { env } from '../config/env.js';

interface YouTubeVideoInfo {
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: string;
  transcript?: string;
}

// Extract video ID from various YouTube URL formats
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get video metadata
export async function getVideoInfo(videoUrl: string): Promise<YouTubeVideoInfo | null> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  // Use YouTube Data API if key available
  if (env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
      const res = await fetch(apiUrl);
      const data = await res.json() as any;

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
          duration: item.contentDetails.duration,
        };
      }
    } catch (err) {
      console.error('[YouTube] API error:', err);
    }
  }

  // Fallback: oEmbed (no API key needed)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      title: data.title || 'Unknown',
      description: '',
      channelTitle: data.author_name || '',
      publishedAt: '',
      thumbnailUrl: data.thumbnail_url || '',
      duration: '',
    };
  } catch {
    return null;
  }
}

// ─── OPTION 1: YouTube Data API v3 — discover available tracks then fetch ─────
// Step 1: use captions.list to find the actual available language(s).
// Step 2: fetch the timedtext XML using the correct language code.
// Prefers English, falls back to any available language + translates via description.
async function transcriptViaYouTubeAPI(videoId: string): Promise<string | null> {
  if (!env.YOUTUBE_API_KEY) return null;
  try {
    // Step 1: get caption tracks list to find available languages
    const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${env.YOUTUBE_API_KEY}`;
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(8000) });
    if (!listRes.ok) return null;
    const listData = await listRes.json() as any;

    const tracks: any[] = listData.items ?? [];
    if (tracks.length === 0) return null;

    // Prefer English ASR, then English manual, then any ASR track, then first available
    const preferred = tracks.find((t: any) => t.snippet?.language === 'en' && t.snippet?.trackKind === 'asr')
      ?? tracks.find((t: any) => t.snippet?.language === 'en')
      ?? tracks.find((t: any) => t.snippet?.trackKind === 'asr')
      ?? tracks[0];

    const lang = preferred.snippet?.language ?? 'en';
    const trackName = preferred.snippet?.name ?? '';

    // Step 2: try multiple timedtext URL formats — YouTube changed the endpoint over time
    const timedtextUrls = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=srv3&name=${encodeURIComponent(trackName)}&kind=asr`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=srv3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=vtt`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
    ];

    for (const url of timedtextUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const body = await res.text();
        if (!body || body.length < 30) continue;

        // Parse XML <text> tags or VTT lines
        let transcript = '';
        const xmlMatches = body.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
        if (xmlMatches && xmlMatches.length > 0) {
          transcript = xmlMatches
            .map(m => m.replace(/<[^>]+>/g, '')
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n/g, ' '))
            .join(' ').replace(/\s+/g, ' ').trim();
        } else if (body.includes('WEBVTT')) {
          // VTT format
          transcript = body
            .replace(/WEBVTT[\s\S]*?\n\n/, '')
            .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> [\s\S]*?\n/g, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        if (transcript.length > 50) {
          console.log(`[YouTube] Option 1 (API timedtext lang=${lang}) OK — ${transcript.length} chars`);
          return transcript.substring(0, 20000);
        }
      } catch {}
    }
    return null;
  } catch (err: any) {
    console.warn('[YouTube] Option 1 failed:', err.message);
    return null;
  }
}

// ─── OPTION 2: youtube-transcript npm package ─────────────────────────────────
// Directly calls YouTube's internal transcript endpoint (same as browser player).
// No API key needed. Works on any video with auto-captions or manual captions.
async function transcriptViaPackage(videoId: string): Promise<string | null> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    if (!items || items.length === 0) return null;
    const transcript = items.map((i: any) => i.text).join(' ').replace(/\s+/g, ' ').trim();
    if (transcript.length < 50) return null;
    console.log(`[YouTube] Option 2 (youtube-transcript pkg) OK — ${transcript.length} chars`);
    return transcript.substring(0, 20000);
  } catch (err: any) {
    console.warn('[YouTube] Option 2 failed:', err.message);
    return null;
  }
}

// ─── OPTION 3: youtubetranscript.com scraper ──────────────────────────────────
async function transcriptViaScraperSite(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtubetranscript.com/?server_vid2=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const matches = text.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
    if (!matches) return null;
    const transcript = matches
      .map(m => m.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
      .join(' ').replace(/\s+/g, ' ').trim();
    if (transcript.length < 50) return null;
    // Reject blocked messages
    if (transcript.toLowerCase().includes("we're sorry") || transcript.toLowerCase().includes('blocking us')) return null;
    console.log(`[YouTube] Option 3 (scraper site) OK — ${transcript.length} chars`);
    return transcript.substring(0, 15000);
  } catch (err: any) {
    console.warn('[YouTube] Option 3 failed:', err.message);
    return null;
  }
}

// ─── OPTION 4: yt-transcript-api.vercel.app ───────────────────────────────────
async function transcriptViaVercelApi(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://yt-transcript-api.vercel.app/api?videoId=${videoId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!Array.isArray(data)) return null;
    const transcript = data.map((item: any) => item.text).join(' ').replace(/\s+/g, ' ').trim();
    if (transcript.length < 50) return null;
    console.log(`[YouTube] Option 4 (vercel api) OK — ${transcript.length} chars`);
    return transcript.substring(0, 15000);
  } catch (err: any) {
    console.warn('[YouTube] Option 4 failed:', err.message);
    return null;
  }
}

// ─── OPTION 5: tactiq.io ──────────────────────────────────────────────────────
async function transcriptViaTactiq(videoId: string): Promise<string | null> {
  try {
    const res = await fetch('https://tactiq-apps-prod.tactiq.io/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: `https://www.youtube.com/watch?v=${videoId}`, langCode: 'en' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data?.captions) return null;
    const transcript = data.captions.map((c: any) => c.text).join(' ').replace(/\s+/g, ' ').trim();
    if (transcript.length < 50) return null;
    console.log(`[YouTube] Option 5 (tactiq) OK — ${transcript.length} chars`);
    return transcript.substring(0, 15000);
  } catch (err: any) {
    console.warn('[YouTube] Option 5 failed:', err.message);
    return null;
  }
}

// ─── Main transcript fetcher — tries all options in order ─────────────────────
export async function getTranscript(videoUrl: string): Promise<string | null> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  console.log(`[YouTube] Fetching transcript for videoId=${videoId}`);

  // Try options in priority order — first success wins
  const result =
    await transcriptViaYouTubeAPI(videoId) ??     // Option 1: official API + timedtext
    await transcriptViaPackage(videoId) ??         // Option 2: youtube-transcript npm
    await transcriptViaScraperSite(videoId) ??     // Option 3: youtubetranscript.com
    await transcriptViaVercelApi(videoId) ??       // Option 4: vercel api
    await transcriptViaTactiq(videoId);            // Option 5: tactiq.io

  if (!result) console.warn(`[YouTube] All transcript options failed for videoId=${videoId}`);
  return result;
}
