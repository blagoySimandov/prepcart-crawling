export function decodeDownloadLink(downloadLink: string) {
  const filenameStarMatch = downloadLink.match(/filename\*=[^']*''([^&]+)/);
  let filename = "";
  if (filenameStarMatch) {
    filename = decodeURIComponent(decodeURIComponent(filenameStarMatch[1]));
  }
  const dateRangeMatch = filename.match(
    /(\d{2}\.\d{2})\.-(\d{2}\.\d{2})\.(\d{4})/,
  );

  let startDate: string | null = null;
  let endDate: string | null = null;

  if (dateRangeMatch) {
    startDate = `${dateRangeMatch[1]}.${dateRangeMatch[3]}`;
    endDate = `${dateRangeMatch[2]}.${dateRangeMatch[3]}`;
  }

  return { filename, startDate, endDate };
}
