/**
 * Safely log errors and filter out browser extension-related noise
 */
export const safeErrorLog = (message, error) => {
  const extensionKeywords = [
    "writing",
    "template",
    "permission error",
    "chrome-extension",
    "extension",
    "content.js",
    "content_script",
    "background.js",
    "popup.js",
    "httpError: false",
    "httpStatus: 200",
    "code: 403",
  ];

  const errorMessage = error?.message || error?.toString() || "";
  const errorCode = error?.code;
  const httpStatus = error?.httpStatus;

  const isExtensionError =
    extensionKeywords.some((keyword) =>
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    ) ||
    (errorCode === 403 && httpStatus === 200) ||
    (error?.httpError === false && error?.code === 403) ||
    (error?.stack && error.stack.includes("content.js")) ||
    (error?.stack && error.stack.includes("extension")) ||
    (error?.name === "i" && error?.code === 403);

  if (!isExtensionError) {
    console.error(`❌ ${message}:`, error);
    return true;
  }
  console.log("🔇 Extension error filtered:", {
    code: error?.code,
    name: error?.name,
  });
  return false;
};
