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
      const data = await res.json();

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
    const data = await res.json();
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

// Get video transcript (using a free transcript service)
export async function getTranscript(videoUrl: string): Promise<string | null> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  try {
    // Use a public transcript API
    const res = await fetch(`https://yt-transcript-api.vercel.app/api?videoId=${videoId}`);
    if (!res.ok) return null;
    const data = await res.json();

    if (Array.isArray(data)) {
      return data.map((item: any) => item.text).join(' ').substring(0, 10000);
    }
    return null;
  } catch {
    return null;
  }
}
