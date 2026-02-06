/**
 * Format datetime to UTC format for API calls
 */
export const formatDateTimeToUTC = (date, timeRange, selectedTimezone) => {
  try {
    const startTime = timeRange.split(" - ")[0];
    const match = selectedTimezone.match(/GMT([+-]\d{2}):(\d{2})/);
    if (!match) {
      console.error("Invalid timezone format:", selectedTimezone);
      return null;
    }

    const offsetHours = parseInt(match[1], 10);
    const offsetMinutes = parseInt(match[2], 10);
    const [startHour, startMinute] = startTime.split(":").map(Number);

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const utcBaseDate = new Date(
      Date.UTC(year, month, day, startHour, startMinute, 0, 0)
    );

    const totalOffsetMinutes = offsetHours * 60 + offsetMinutes;
    const utcDateTime = new Date(
      utcBaseDate.getTime() - totalOffsetMinutes * 60000
    );

    const utcYear = utcDateTime.getUTCFullYear();
    const utcMonth = String(utcDateTime.getUTCMonth() + 1).padStart(2, "0");
    const utcDay = String(utcDateTime.getUTCDate()).padStart(2, "0");
    const utcHours = String(utcDateTime.getUTCHours()).padStart(2, "0");
    const utcMinutes = String(utcDateTime.getUTCMinutes()).padStart(2, "0");

    return `${utcYear}-${utcMonth}-${utcDay} ${utcHours}:${utcMinutes}`;
  } catch (error) {
    console.error("Error formatting datetime to UTC:", error);
    return null;
  }
};

/**
 * Format timezone for API calls (replace spaces with underscores)
 */
export const formatTimezoneForAPI = (timezone) => {
  return timezone.replace(/(.*\)) (.+)/, (match, prefix, tz) => {
    return `${prefix} ${tz.replace(/ /g, "_")}`;
  });
};
