import fetch from "node-fetch";

export async function extractPdfLinks(possibleDownloadLinks: string[]) {
  for (const link of possibleDownloadLinks) {
    try {
      const data = await extractDataFromUrl(link);
      return data;
    } catch (error) {
      console.error(error);
    }
  }
}

async function extractDataFromUrl(url: string): Promise<any> {
  const response = await fetch(url);
  const html = await response.text();

  // Find the <script> block containing 'var data ='
  const scriptRegex = /<script[^>]*>[\s\S]*?var data =\s*({.*?});/;
  const match = html.match(scriptRegex);

  if (!match || match.length < 2) {
    throw new Error("Data not found in the script tag");
  }

  const dataJson = match[1];
  return JSON.parse(dataJson);
}
