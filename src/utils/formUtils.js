// Form utility functions

export const validateAndCorrectEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Basic email validation
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      correctedEmail: null,
      error: "Please enter a valid email address",
    };
  }

  // Domain auto-correction
  let correctedEmail = email;
  const [localPart, domain] = email.split("@");
  const domainLower = domain.toLowerCase();

  if (domainLower.includes("gmal") || domainLower.includes("gmai")) {
    correctedEmail = `${localPart}@gmail.com`;
  } else if (domainLower.includes("yah")) {
    correctedEmail = `${localPart}@yahoo.com`;
  } else if (
    domainLower.includes("hotmai") ||
    domainLower.includes("hotmal")
  ) {
    correctedEmail = `${localPart}@hotmail.com`;
  } else if (domainLower.includes("outloo")) {
    correctedEmail = `${localPart}@outlook.com`;
  }

  return {
    isValid: true,
    correctedEmail,
    needsCorrection: correctedEmail !== email,
    originalEmail: email,
  };
};

export const formatDateDDMMMYYYY = (date) => {
  // Ensure date is a Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  const day = dateObj.getDate().toString().padStart(2, "0");
  const month = dateObj.toLocaleString("en-US", { month: "short" }); // "Jul"
  const year = dateObj.getFullYear();

  return `${day}-${month}-${year}`;
};

export const parseBookingDetails = (data) => {
  if (!data) return [];

  const bookings = [];

  // Handle different data formats
  if (Array.isArray(data)) {
    // Direct array format
    bookings.push(...data);
  } else if (typeof data === "object") {
    // Object format with dates as keys
    Object.entries(data).forEach(([date, timeSlots]) => {
      if (typeof timeSlots === "object") {
        Object.entries(timeSlots).forEach(([time, slotData]) => {
          if (slotData && slotData.events && Array.isArray(slotData.events)) {
            slotData.events.forEach((event) => {
              bookings.push({
                ...event,
                date: date,
                time: time,
              });
            });
          }
        });
      }
    });
  }

  // Sort bookings by date and time
  return bookings.sort((a, b) => {
    const dateA = new Date(a.start_time || a.date);
    const dateB = new Date(b.start_time || b.date);
    return dateA - dateB;
  });
};
