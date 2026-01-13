// Popup script for Qdrin Focus Blocker

let blockedWebsites = [];
let allowWebsites = [];

// Initialize popup
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    updateStatus(response.isBlocking);
    blockedWebsites = response.blockedWebsites || [];
    allowWebsites = response.allowWebsites || [];
    renderWebsiteList();
    renderAllowList();
  } catch (err) {
    console.error('Failed to get status:', err);
    document.getElementById('status-text').textContent = 'Error: ' + err.message;
    document.getElementById('website-list').innerHTML = '<li class="empty-state">Error loading extension</li>';
  }
}

// Update status display
function updateStatus(isBlocking) {
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('status-text');

  if (isBlocking) {
    statusEl.className = 'status active';
    statusText.textContent = '🔒 Blocking is ACTIVE';
  } else {
    statusEl.className = 'status inactive';
    statusText.textContent = '⏸️ Blocking is inactive';
  }
}

// Render website list
function renderWebsiteList() {
  const listEl = document.getElementById('website-list');

  if (blockedWebsites.length === 0) {
    listEl.innerHTML = '<li class="empty-state">No websites blocked</li>';
    return;
  }

  listEl.innerHTML = blockedWebsites.map((domain, index) => `
    <li class="website-item">
      <span>${domain}</span>
      <button data-index="${index}">Remove</button>
    </li>
  `).join('');

  // Add event listeners to remove buttons
  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeWebsite(index);
    });
  });
}

// Render allow list
function renderAllowList() {
  const listEl = document.getElementById('allow-list');

  if (!allowWebsites.length) {
    listEl.innerHTML = '<li class="empty-state">No websites allowed</li>';
    return;
  }

  listEl.innerHTML = allowWebsites.map((domain, index) => `
    <li class="website-item">
      <span>${domain}</span>
      <button data-index="${index}">Remove</button>
    </li>
  `).join('');

  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeAllow(index);
    });
  });
}

// Add website
async function addWebsite() {
  const input = document.getElementById('website-input');
  const value = input.value.trim().toLowerCase();

  if (!value) return;

  // Light validation: no spaces and must contain a dot to avoid ultra-broad strings
  if (value.includes(' ') || !value.includes('.')) {
    alert('Please enter a domain or URL fragment (e.g., reddit.com or reddit.com/r/funny)');
    return;
  }

  if (blockedWebsites.includes(value)) {
    alert('This website is already in the list');
    return;
  }

  blockedWebsites.push(value);
  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_WEBSITES',
      websites: blockedWebsites
    });
  } catch (err) {
    console.error('Failed to update websites:', err);
    alert('Failed to update blocked websites');
    blockedWebsites.pop();
    return;
  }

  input.value = '';
  renderWebsiteList();
}

// Add website to allowlist
async function addAllow() {
  const input = document.getElementById('allow-input');
  const value = input.value.trim().toLowerCase();

  if (!value) return;

  if (value.includes(' ') || !value.includes('.')) {
    alert('Please enter a domain or URL fragment (e.g., music.youtube.com or youtube.com/i/grok)');
    return;
  }

  if (allowWebsites.includes(value)) {
    alert('This website is already allowed');
    return;
  }

  allowWebsites.push(value);
  try {
    await chrome.runtime.sendMessage({
      type: 'UPDATE_ALLOWLIST',
      websites: allowWebsites
    });
  } catch (err) {
    console.error('Failed to update allow list:', err);
    alert('Failed to update allowed websites');
    allowWebsites.pop();
    return;
  }

  input.value = '';
  renderAllowList();
}

// Remove website from allowlist
async function removeAllow(index) {
  allowWebsites.splice(index, 1);
  await chrome.runtime.sendMessage({
    type: 'UPDATE_ALLOWLIST',
    websites: allowWebsites
  });
  renderAllowList();
}

// Remove website
async function removeWebsite(index) {
  blockedWebsites.splice(index, 1);
  await chrome.runtime.sendMessage({
    type: 'UPDATE_WEBSITES',
    websites: blockedWebsites
  });
  renderWebsiteList();
}

// Event listeners
document.getElementById('add-btn').addEventListener('click', addWebsite);
document.getElementById('website-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addWebsite();
  }
});
document.getElementById('allow-add-btn').addEventListener('click', addAllow);
document.getElementById('allow-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addAllow();
  }
});

// Initialize
init();
