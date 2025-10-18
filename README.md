# ContextFill

![ContextFill logo](extension/icons/source.png)

ContextFill is a Chrome extension that lets you highlight any text and launch customizable lookups based on regex-driven categories. It ships with a starter set aimed at OSINT workflows (IP addresses, SHA256 hashes, URLs) including normalization helpers for defanged indicators, but every category, regex, replacement rule, and URL template can be edited or replaced to fit different analysis flows.

## Features

- **Regex-powered categories** – Define any number of categories with regular expressions to match highlighted text.
- **Normalization rules** – Apply ordered regex replacements before matching so defanged IOCs still match (e.g., replace `\[.\]` with `.`).
- **Templated URLs** – Use placeholders like `{{selection}}`, `{{normalizedSelection}}`, `{{rawSelection}}`, and `{{rawSelectionEncoded}}` to generate investigation URLs.
- **Per-category “Open all”** – Click a category name to open every associated URL in one shot.
- **Options manager** – Add/edit categories, export/import all settings, or share individual categories as JSON files.
- **Default playbook** – Ships with IP, SHA256, and URL categories plus common normalization rules.

## Customizing Categories

1. Right-click ContextFill in `chrome://extensions` and choose **Extension options**.
2. Use **Add Category** to define:
   - **Name** – A friendly label
   - **Regular expression** – JavaScript RegExp (no slashes)
   - **Normalization rules** – Pattern, replacement, and flags applied in order before matching
   - **URL templates** – URLs containing placeholders  
     - `{{selection}}` – normalized (post-replacement) text, URL-encoded  
     - `{{normalizedSelection}}` – normalized text, raw  
     - `{{rawSelection}}` – original highlight  
     - `{{rawSelectionEncoded}}` – original highlight, URL-encoded
3. Use **Export All** to back up everything, **Export category** to share a single category, and the matching import buttons to restore.

## License

Refer to the [license file](LICENSE) included with this repository.
