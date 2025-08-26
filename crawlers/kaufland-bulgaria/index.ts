import { BrochureStore } from "../katalozi/constants.js";
import {
  City,
  KataloziCrawler,
  KataloziCrawlerConfig,
} from "../katalozi/index.js";

export interface KauflandKataloziCrawlerConfig {
  storeId: string;
  country: string;
  projectId?: string;
}
const START_LINK = "https://katalozi-bg.info/company/17/Kaufland";
const STORE_ID = "kaufland-bg";
const COUNTRY = "bulgaria";
const PROJECT_ID = "prepcart-prod";

export class KauflandKataloziCrawler extends KataloziCrawler {
  constructor() {
    const kataloziConfig: KataloziCrawlerConfig = {
      storeId: STORE_ID,
      country: COUNTRY,
      projectId: PROJECT_ID,
    };
    super(START_LINK, kataloziConfig);
  }
}

const crawler = new KauflandKataloziCrawler();
crawler.startWithCity(City.Sofia, BrochureStore.KAUFLAND);
