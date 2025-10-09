// Date utility functions
export const getWeekDates = (startDate) => {
  const dates = [];
  const start = new Date(startDate);

  // Get Monday of the week
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Handle Sunday
  const monday = new Date(start);
  monday.setDate(start.getDate() + mondayOffset);

  // Generate 7 days starting from Monday
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }

  return dates;
};

export const formatDate = (date) => {
  // If it's already a string in YYYY-MM-DD format, return it directly
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // Ensure date is a Date object (handles both Date objects and datetime strings)
  const dateObj = date instanceof Date ? date : new Date(date);

  // Use UTC methods to format the date to match timezone-converted dates
  const year = dateObj.getUTCFullYear();
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = dateObj.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`; // YYYY-MM-DD format
};

export const formatDisplayDate = (date) => {
  // If it's a string in YYYY-MM-DD format (without time), parse it directly to avoid timezone issues
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-");
    return `${day}-${month}-${year}`;
  }

  // Ensure date is a Date object (handles both Date objects and datetime strings)
  const dateObj = date instanceof Date ? date : new Date(date);

  // Use UTC methods if it's a timezone-converted date to avoid further shifts
  const day = dateObj.getUTCDate().toString().padStart(2, "0");
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = dateObj.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

export const formatShortDate = (date) => {
  // Ensure date is a Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
  });
};

export const getDayName = (date) => {
  // If it's a string in YYYY-MM-DD format (without time), add time to ensure correct date parsing
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const dateObj = new Date(date + "T12:00:00");
    return dateObj.toLocaleDateString("en-US", { weekday: "long" });
  }

  // Ensure date is a Date object (handles both Date objects and datetime strings)
  const dateObj = date instanceof Date ? date : new Date(date);

  // Use UTC to get the day name to match the timezone-converted date
  return dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
};

export const isSameWeek = (date1, date2) => {
  const week1 = getWeekDates(date1);
  const week2 = getWeekDates(date2);
  return formatDate(week1[0]) === formatDate(week2[0]);
};

export const getCurrentWeekStart = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return monday;
};

export const getCurrentMonthRange = () => {
  const today = new Date();
  // Start of the month
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  // End of the month
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const formatDate = (date) => date.toISOString().split("T")[0];
  return {
    startOfMonth: formatDate(startOfMonth), // 'yyyy-mm-dd'
    endOfMonth: formatDate(endOfMonth), // 'yyyy-mm-dd'
  };
};
