// Display the blocked URL
(async () => {
  const urlDiv = document.getElementById('blocked-url');

  // Ask background script for the original blocked URL
  // Add a small retry loop to handle timing issues with storage
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_URL' });
      const blockedUrl = response.url || '';

      if (blockedUrl) {
        urlDiv.textContent = blockedUrl;
        return; // Success, exit
      } else if (attempt < maxRetries - 1) {
        // URL not found, wait and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
    } catch (err) {
      console.error('Failed to get URL (attempt', attempt + 1, '):', err);
    }
  }

  // If we get here, no URL was found
  urlDiv.style.display = 'none';
})();
