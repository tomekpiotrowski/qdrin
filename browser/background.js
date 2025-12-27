// Qdrin Focus Blocker - Background Service Worker

// State
let isBlocking = false;
let blockedWebsites = [];

// Poll the Qdrin app for focus state every 2 seconds
async function pollQdrinStatus() {
    try {
        const response = await fetch('http://127.0.0.1:42069/status');
        if (response.ok) {
            const data = await response.json();
            const wasFocusing = isBlocking;
            isBlocking = data.is_focusing;

            // Update blocking rules if state changed
            if (wasFocusing !== isBlocking) {
                await updateBlockingRules();

                // Check all open tabs when blocking becomes active
                if (isBlocking) {
                    await checkAllOpenTabs();
                }
            }
        }
    } catch (err) {
        // Qdrin app not running, disable blocking
        if (isBlocking) {
            isBlocking = false;
            await updateBlockingRules();
        }
    }
}

// Start polling
setInterval(pollQdrinStatus, 2000);
pollQdrinStatus(); // Initial check

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_STATUS') {
        sendResponse({ isBlocking, blockedWebsites });
    } else if (message.type === 'UPDATE_WEBSITES') {
        blockedWebsites = message.websites;
        if (isBlocking) {
            updateBlockingRules();
        }
        // Save to storage
        chrome.storage.local.set({ blockedWebsites });
        sendResponse({ success: true });
    } else if (message.type === 'GET_CURRENT_TAB_URL') {
        // Get URL for the tab that sent this message
        const tabId = sender.tab.id;
        (async () => {
            // Retry a few times in case storage is still being written
            for (let i = 0; i < 3; i++) {
                const result = await chrome.storage.session.get([`blocked_${tabId}`]);
                const url = result[`blocked_${tabId}`];
                if (url) {
                    console.log('Got URL from storage on attempt', i + 1, ':', url);
                    sendResponse({ url });
                    return;
                }
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            console.log('No URL found in storage for tab', tabId);
            sendResponse({ url: '' });
        })();
        return true; // Keep message channel open for async response
    }
    return true; // Keep message channel open for async response
});

// Update blocking rules
async function updateBlockingRules() {
    if (!isBlocking || blockedWebsites.length === 0) {
        // Remove all rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1)
        });

    // If we just disabled blocking, restore blocked tabs to their original URLs
    if (!isBlocking) {
      await restoreBlockedTabs();
    }
    return;
  }

  // Create rules for blocked websites
  const rules = blockedWebsites.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { url: chrome.runtime.getURL('blocked.html') }
    },
    condition: {
      urlFilter: `*://*.${domain}/*`,
      resourceTypes: ['main_frame']
    }
  }));

  // Update rules
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1),
    addRules: rules
  });
}

// Restore tabs that were redirected to blocked.html back to their original URLs
async function restoreBlockedTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.url.includes('blocked.html')) {
        // Get original URL from session storage
        const stored = await chrome.storage.session.get([`blocked_${tab.id}`]);
        const originalUrl = stored[`blocked_${tab.id}`];
        if (originalUrl) {
          console.log('Restoring tab', tab.id, 'to:', originalUrl);
          // Clean up storage FIRST to avoid any re-blocking issues
          await chrome.storage.session.remove([`blocked_${tab.id}`]);
          // Then restore the tab
          await chrome.tabs.update(tab.id, { url: originalUrl });
        }
      }
    }
  } catch (err) {
    console.error('Error restoring blocked tabs:', err);
  }
}

// Check if a URL should be blocked
function shouldBlockUrl(url) {
  if (!isBlocking || !url) return false;
  try {
    const urlObj = new URL(url);
    return blockedWebsites.some(domain =>
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Hook into navigation BEFORE redirects happen
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (!isBlocking || details.frameId !== 0) return; // Only main frame

    if (shouldBlockUrl(details.url)) {
        // Always store the original URL (overwrites any previous entry for this tab)
        chrome.storage.session.set({
            [`blocked_${details.tabId}`]: details.url
        });
        console.log('Storing blocked URL for tab', details.tabId, ':', details.url);
    } else {
        // Clear storage for non-blocked URLs to ensure clean state
        chrome.storage.session.remove([`blocked_${details.tabId}`]);
    }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (!isBlocking) {
        return;
    }

    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && shouldBlockUrl(tab.url)) {
        // Store the original URL before redirecting
        await chrome.storage.session.set({
            [`blocked_${activeInfo.tabId}`]: tab.url
        });
        chrome.tabs.update(activeInfo.tabId, {
            url: chrome.runtime.getURL('blocked.html')
        });
    }
});

// Handle tab updates (e.g., when URL changes in existing tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isBlocking || !changeInfo.url) return;

    if (shouldBlockUrl(changeInfo.url)) {
        // Store the original URL before redirecting
        chrome.storage.session.set({
            [`blocked_${tabId}`]: changeInfo.url
        });
        chrome.tabs.update(tabId, {
            url: chrome.runtime.getURL('blocked.html')
        });
    }
});

// When blocking state becomes active, check all open tabs
async function checkAllOpenTabs() {
    if (!isBlocking) return;

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (shouldBlockUrl(tab.url)) {
            // Store the original URL before redirecting
            await chrome.storage.session.set({
                [`blocked_${tab.id}`]: tab.url
            });
            chrome.tabs.update(tab.id, {
                url: chrome.runtime.getURL('blocked.html')
            });
        }
    }
}

// Load blocked websites from storage on startup
chrome.storage.local.get(['blockedWebsites'], (result) => {
    if (result.blockedWebsites) {
        blockedWebsites = result.blockedWebsites;
    }
});

console.log('Qdrin Focus Blocker loaded');
