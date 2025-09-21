export interface RawElement {
  type: string;
  data: unknown;
}

export type BodyRaw = {
  type: string;
  data: {
    contentUri?: string;
    elements: RawElement[];
  };
};

export interface NavigationLink {
  name: string;
  uri: string;
}

export interface Action {
  type: string;
  data: {
    path?: string;
  };
}

export interface CatalogueElement {
  name: string;
  action: Action;
  elements: CatalogueElement[];
}

export type ExtractedData = {
  data: {
    initialData?: {
      body?: BodyRaw[];
      catalogue?: CatalogueElement[];
    };
  }[];
  layout: string;
};

export type PageCrawlResult = ParsedProduct[];

export interface ParsedProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  priceDisplay: string;
  imageUrl: string;
  category: string;
  categoryId?: string;
  isSponsored: boolean;
  isRestricted: boolean;
  isWeighted: boolean;
  saleType: string;
  promotions: Promotion[];
}

export interface Promotion {
  id: string;
  title: string;
  type: string;
  newPrice?: number;
  isPrime: boolean;
}

export type ScraperResult = {
  result: PageCrawlResult;
  fullData: ExtractedData;
};
