export interface ImageData {
  id: string;
  buffer: Buffer;
}

export interface KataloziCrawlerConfig {
  storeId: string;
  projectId?: string;
}
