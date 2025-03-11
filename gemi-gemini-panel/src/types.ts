export interface GeminiAnalyzerOptions {
  apiKey: string;
  model: string;
  panelId: string;
  maxCallsPerMinute: number;
  minTimeBetweenCalls: number;
}
