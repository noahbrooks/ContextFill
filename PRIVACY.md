# Privacy Policy

**Effective date:** October 18, 2025

ContextFill is a Chrome extension that helps you normalize highlighted text and open investigation URLs from your browser’s context menu. The extension is designed to run entirely on your device and does not collect, transmit, or store personal data.

## Data Collection

- **No personal data collected** – ContextFill does not gather or send any personal information, browsing history, or page contents to external servers.
- **Local configuration only** – All category, normalization, and template settings are stored in Chrome’s `chrome.storage.sync`, which is managed by the browser and synced to your Google account if you allow it. The extension does not access or transmit those settings beyond Chrome’s storage APIs.

## Permissions Explained

- **contextMenus** – Used to add right-click menu items when you select text.
- **storage** – Used solely to save your categories, normalization rules, and URL templates.
- **tabs** – Needed to open the URLs you’ve configured in new browser tabs.
- **Host permissions (`<all_urls>`)** – Allow the content script to read the highlighted selection text on the current page. No other page data is read or modified.

## Third-Party Services

ContextFill does not integrate with or send data to any external services. When you choose a menu option, the extension simply opens a new tab with the URL you configured, which may point to third-party sites of your choosing.

## Updates

Any changes to this policy will be published in the project repository. Because the extension does not collect data, updates typically relate to clarifying descriptions or reflecting new functionality.

## Contact

If you have questions about this policy or encounter issues, please open an issue in the project’s GitHub repository.

