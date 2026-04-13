interface YouTubeVideoInfo {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnailUrl: string;
    duration: string;
    transcript?: string;
}
export declare function extractVideoId(url: string): string | null;
export declare function getVideoInfo(videoUrl: string): Promise<YouTubeVideoInfo | null>;
export declare function getTranscript(videoUrl: string): Promise<string | null>;
export {};
