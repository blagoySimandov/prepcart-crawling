import * as cheerio from "cheerio";

interface IframeExtractorResult {
  found: boolean;
  src?: string;
  error?: string;
}

/**
 * Fetches a URL and searches for a specific iframe pattern, then extracts its src attribute
 * @param url - The URL to fetch and search
 * @param searchPattern - The partial iframe HTML to search for (optional, defaults to the Billa pattern)
 * @returns Promise with the extraction result
 */
export async function extractIframeSrc(
  url: string,
): Promise<IframeExtractorResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return {
        found: false,
        error: `HTTP error! status: ${response.status}`,
      };
    }

    const html = await response.text();
    console.log(html);

    const $ = cheerio.load(html);

    let foundSrc: string | undefined;

    $("iframe").each((_, element) => {
      const $iframe = $(element);
      const style = $iframe.attr("style");
      const className = $iframe.attr("class");
      const src = $iframe.attr("src");

      if (
        (style?.includes("height:600px") &&
          className?.includes("d-block") &&
          src?.includes(
            "https://view.publitas.com/billa-bulgaria/bg_weekly_digital",
          )) ||
        src?.includes(
          "https://view.publitas.com/billa-bulgaria/web_bg_weekly_digital_leaflet",
        )
      ) {
        foundSrc = src;
        return false;
      }
    });

    return {
      found: true,
      src: foundSrc,
    };
  } catch (error) {
    return {
      found: false,
      error: error as string,
    };
  }
}
