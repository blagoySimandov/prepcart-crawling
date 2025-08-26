import { BrochureStore, City } from "../katalozi/constants.js";
import { KataloziCrawler } from "../katalozi/index.js";
import { KataloziCrawlerConfig } from "../katalozi/types.js";

export interface KauflandKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const STORE_ID = "kaufland-bg";
const PROJECT_ID = "prepcart-prod";

export class KauflandKataloziCrawler extends KataloziCrawler {
  constructor() {
    const kataloziConfig: KataloziCrawlerConfig = {
      storeId: STORE_ID,
      projectId: PROJECT_ID,
    };
    super(kataloziConfig);
  }
}

const crawler = new KauflandKataloziCrawler();
crawler.startWithCity(City.Sofia, BrochureStore.KAUFLAND);
