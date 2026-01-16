# Akkermansia Shopify Theme

Shopify theme repository for The Akkermansia Company.

## Setup

This repository contains the Shopify theme files. To connect this GitHub repository to your Shopify store:

### Option 1: Using Shopify CLI (Recommended for Development)

1. Install Shopify CLI:
   ```bash
   npm install -g @shopify/cli @shopify/theme
   ```

2. Authenticate with Shopify:
   ```bash
   shopify auth login
   ```

3. Connect to your theme:
   ```bash
   shopify theme dev
   ```

### Option 2: Using GitHub Integration in Shopify Admin

1. Go to your Shopify Admin → Online Store → Themes
2. Click "Add theme" → "Connect from GitHub"
3. Authorize Shopify to access your GitHub account
4. Select this repository: `LaylinesSteve/akkermansia-shopify`
5. Select the `main` branch
6. Click "Connect"

### Option 3: Manual Upload

1. Download the theme files from this repository
2. Zip the theme directory (excluding .git, .gitignore, README.md)
3. Upload via Shopify Admin → Online Store → Themes → "Add theme" → "Upload zip file"

## Development

The theme files are located in:
```
theme_export__www-theakkermansiacompany-com-theme-akkermansia-shopify-ready__14JAN2026-0939am/
```

### Theme Structure

- `assets/` - CSS, JavaScript, and image files
- `config/` - Theme configuration files
- `layout/` - Theme layout templates
- `locales/` - Translation files
- `sections/` - Reusable theme sections
- `snippets/` - Reusable code snippets
- `templates/` - Page templates

## Git Workflow

- `main` branch - Production-ready theme code
- Always test changes in a development theme before deploying to production

## Notes

- The `.gitignore` file excludes zip files, node_modules, and other unnecessary files
- Theme settings are stored in `config/settings_data.json`
- Custom CSS can be found in `assets/custom.css`
