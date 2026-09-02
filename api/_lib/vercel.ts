export interface VercelRequest {
  method?: string;
  body?: unknown;
}

export interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(value: unknown): VercelResponse;
}
