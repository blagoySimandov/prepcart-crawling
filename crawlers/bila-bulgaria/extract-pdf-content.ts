export async function extractPdfContent(
  link: string
): Promise<string | undefined> {
  try {
    const response = await fetch(link);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return buffer.toString("base64");
  } catch (error) {
    console.error("Error fetching PDF:", error);
  }
}
