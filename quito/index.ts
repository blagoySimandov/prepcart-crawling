import express, { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";

interface Product {
  name: string;
  store: string;
  price: string | null;
  pricePerUnit: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  discountInfo: string | null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = "https://www.quidu.ie";

app.get("/search", async (req: Request, res: Response) => {
  const { search_input } = req.query;

  if (!search_input || typeof search_input !== "string") {
    return res
      .status(400)
      .json({ error: 'The "search_input" query parameter is required.' });
  }

  const targetUrl = `${BASE_URL}/search-product/search-results/?search_input=${encodeURIComponent(
    search_input,
  )}`;

  try {
    const response = await axios.get(targetUrl);
    const html = response.data;

    const $ = cheerio.load(html);
    const products: Product[] = [];

    $(".card.card-banner").each((index, element) => {
      const card = $(element);

      const name = card.find("p.result-text").first().text().trim();
      const store = card.find(".ban-tx").text().trim();
      const price = card.find(".eyoro b").text().trim() || null;
      const pricePerUnit = card.find(".eyoeo-2 p").text().trim() || null;
      const relativeUrl = card.find("a").first().attr("href");
      const productUrl = relativeUrl ? `${BASE_URL}${relativeUrl}` : null;
      const imageUrl = card.find("img.img-fluid").attr("src") || null;

      const discountInfo =
        card.find('p.result-text[style*="color:#FF2F04"]').text().trim() ||
        null;

      products.push({
        name,
        store,
        price,
        pricePerUnit,
        imageUrl,
        productUrl,
        discountInfo,
      });
    });

    res.status(200).json(products);
  } catch (error) {
    console.error("Scraping failed:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch or parse the product data." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
