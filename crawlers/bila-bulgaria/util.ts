/**
 * Extracts start and end dates from a string in the format:
 * bg_weekly_digital_leaflet_DD-MM-DD-MM-YYYY__cwXX__web
 *
 * @param dateString - The input string containing the date range
 * @returns Object with startDate and endDate as Date objects, or null if parsing fails
 */
export function extractDateRange(
  dateString: string,
): { startDate: Date; endDate: Date } | null {
  const datePattern = /(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{4})/;
  const match = dateString.match(datePattern);

  if (!match) {
    return null;
  }

  const [, startDay, startMonth, endDay, endMonth, year] = match;

  // Create UTC Date objects to avoid timezone issues
  const startDate = new Date(
    Date.UTC(parseInt(year), parseInt(startMonth) - 1, parseInt(startDay)),
  );
  const endDate = new Date(
    Date.UTC(parseInt(year), parseInt(endMonth) - 1, parseInt(endDay)),
  );

  // Validate that the dates are valid
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return null;
  }

  return {
    startDate,
    endDate,
  };
}
