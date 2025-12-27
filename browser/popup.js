// Popup script for Qdrin Focus Blocker

let blockedWebsites = [];

// Initialize popup
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    updateStatus(response.isBlocking);
    blockedWebsites = response.blockedWebsites || [];
    renderWebsiteList();
  } catch (err) {
    console.error('Failed to get status:', err);
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

// Add website
async function addWebsite() {
  const input = document.getElementById('website-input');
  const domain = input.value.trim().toLowerCase();

  if (!domain) return;

  // Basic domain validation
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    alert('Please enter a valid domain (e.g., reddit.com)');
    return;
  }

  if (blockedWebsites.includes(domain)) {
    alert('This website is already in the list');
    return;
  }

  blockedWebsites.push(domain);
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

// Initialize
init();
