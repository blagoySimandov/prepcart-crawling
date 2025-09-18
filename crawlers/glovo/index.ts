import { parseNuxtData } from "parse-hydration-data";
import axios from "axios";
import { extractProductData } from "./clean-model.js";
import { writeObjectToFile } from "../util.js";

type ExtractedData = {
  data: {
    initialData: {
      body: {
        type: string;
        data: {
          elements: any[];
        };
      }[];
    };
  }[];
  layout: string;
};

(async () => {
  try {
    const { data: html } = await axios.get("https://glovoapp.com/bg/en/varna/billa-var?content=top-sellers-ts");

    const fullData: ExtractedData = parseNuxtData(html);
    writeObjectToFile(fullData, "uncleaned.json");
    for (const v of fullData.data) {
      const bodyArr = v?.initialData?.body;
      if (!bodyArr) continue;
      for (const body of bodyArr) {
        if (body?.type !== "GRID") continue;
        const products = body?.data?.elements;
        const cleanedProducts = extractProductData(products);
        writeObjectToFile(cleanedProducts);
      }
    }
  } catch (error) {
    console.error("An error was found executing the glovo crawler", error);
  }
})();
