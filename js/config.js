/* ------------------------------------------------------------------
   SecureVault – settings you may edit
   ------------------------------------------------------------------ */
window.APP_CONFIG = {
  // 1) Paste your Google Apps Script "Web app" URL here (ends with /exec)
  API_URL:
    "https://script.google.com/macros/s/AKfycbyCQQjDQBxlNmiKorcIJjLLGzC7KvNS1UAkbqpDxTz3yl1X17HLUMzdbpu5A9L795o/exec",

  // 2) Minutes credentials stay visible after you enter the password on a card
  REVEAL_TIMEOUT_MIN: 5,

  // 3) Minutes of inactivity before the whole app locks itself
  AUTO_LOCK_MIN: 5,

  // 4) Key-stretching strength. DO NOT change after you create your vault,
  //    otherwise your existing data can no longer be decrypted.
  PBKDF2_ITERATIONS: 250000,
};
