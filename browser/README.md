# Qdrin Focus Blocker - Chrome Extension

A Chrome extension that automatically blocks distracting websites during Qdrin focus blocks.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `browser` folder from the Qdrin project

## Usage

1. Click the extension icon in Chrome toolbar
2. Add websites you want to block (e.g., `reddit.com`, `twitter.com`)
3. When the Qdrin timer enters focus mode, these websites will be automatically blocked
4. The extension shows a focus reminder page instead

## Features

- ✅ Block websites during focus blocks
- ✅ Custom blocked website list
- ✅ Beautiful blocked page with focus reminder
- ✅ Easy to manage blocked sites
- ✅ **Automatic sync with Qdrin timer state**

## How It Works

The extension polls the Qdrin app every 2 seconds (via HTTP at `http://127.0.0.1:42069/status`) to check if you're in focus mode. When focus mode is detected, it automatically enables website blocking using Chrome's declarativeNetRequest API.

## Requirements

- Qdrin app must be running for automatic sync to work
- The Qdrin app exposes a local HTTP server on port 42069 for status updates

## Notes

- Websites are blocked at the domain level (e.g., blocking `reddit.com` blocks all reddit subdomains)
- Blocking is automatically enabled/disabled based on Qdrin timer state
- No manual control needed - it just works! 🎉
