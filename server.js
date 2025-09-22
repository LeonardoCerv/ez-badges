require('dotenv').config();

/**
 * EZ Badges
 *
 * A dynamic SVG badge generator inspired by img.shields.io, featuring the ability
 * to use your own image paths and convert them into SVG badges for your README files.
 *
 * Generates customizable badges with icons and text. Handles SVG color changes,
 * image processing, and serves everything via Express. Built for performance
 * and security with Sharp, Potrace, and DOMPurify.
 */

const express = require('express');
const { generateStaticBadge } = require('./badges/StaticBadge');
const { GitHubViewersBadge, GitHubStarsBadge, DownloadsBadge, LastCommitBadge, OpenIssuesBadge, initializeMemoryStorage } = require('./badges/DynamicBadge');

const app = express();
const port = process.env.PORT || 3000;

/**
 * Main endpoint for generating badges. Takes query params for text, icon,
 * colors, etc. Processes icons async and caches the result.
 */
app.get('/badge', async (req, res) => {
  const {
    text,
    icon,
    bgColor = 'white',
    iconColor,
    textColor = 'white',
    edges = 'squared',
    v, // version/cache-busting parameter
    cacheSeconds // optional cache duration override
  } = req.query;

  try {
    const svg = await generateStaticBadge({ text, icon, bgColor, iconColor, textColor, edges });

    res.setHeader('Content-Type', 'image/svg+xml');

    // Hybrid cache control approach
    if (v || cacheSeconds) {
      // User wants instant updates - maximum cache busting
      res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (cacheSeconds && parseInt(cacheSeconds) > 0) {
      // User specified custom cache duration
      res.setHeader('Cache-Control', `public, max-age=${parseInt(cacheSeconds)}`);
    } else {
      // Default: allow some caching for static badges
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    res.send(svg);
  } catch (error) {
    console.error('Error generating badge:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Dynamic badge endpoint. Supports different types like viewers, downloads, etc.
 */
app.get('/badge/dynamic/:type', async (req, res) => {
  const { type } = req.params;
  const {
    repo,
    package: packageName,
    text, // Custom text to show before the dynamic value
    icon,
    bgColor = 'blue',
    iconColor,
    textColor = 'white',
    edges = 'squared',
    v, // version/cache-busting parameter
    cacheSeconds // optional cache duration override
  } = req.query;

  let badgeInstance;

  try {
    switch (type) {
      case 'viewers':
        if (!repo) return res.status(400).send('Missing repo parameter');
        badgeInstance = new GitHubViewersBadge({ repo, text, icon, bgColor, iconColor, textColor, edges });
        break;
      case 'stars':
        if (!repo) return res.status(400).send('Missing repo parameter');
        badgeInstance = new GitHubStarsBadge({ repo, text, icon, bgColor, iconColor, textColor, edges });
        break;
      case 'downloads':
        if (!packageName) return res.status(400).send('Missing package parameter');
        badgeInstance = new DownloadsBadge({ package: packageName, text, icon, bgColor, iconColor, textColor, edges });
        break;
      case 'last-commit':
        if (!repo) return res.status(400).send('Missing repo parameter');
        badgeInstance = new LastCommitBadge({ repo, text, icon, bgColor, iconColor, textColor, edges });
        break;
      case 'open-issues':
        if (!repo) return res.status(400).send('Missing repo parameter');
        badgeInstance = new OpenIssuesBadge({ repo, text, icon, bgColor, iconColor, textColor, edges });
        break;
      default:
        return res.status(400).send('Invalid badge type');
    }

    const svg = await badgeInstance.generate();

    res.setHeader('Content-Type', 'image/svg+xml');

    // Hybrid cache control approach (like Shields.io)
    if (v || cacheSeconds) {
      // User wants instant updates - maximum cache busting
      res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (cacheSeconds && parseInt(cacheSeconds) > 0) {
      // User specified custom cache duration
      res.setHeader('Cache-Control', `public, max-age=${parseInt(cacheSeconds)}`);
    } else {
      // Default: no-cache but allow some caching (GitHub will still cache briefly)
      res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
    }

    res.send(svg);
  } catch (error) {
    console.error('Error generating dynamic badge:', error);
    console.error('Error stack:', error.stack);
    console.error('Request params:', { type, repo, packageName, text, icon, bgColor, iconColor, textColor, edges, v, cacheSeconds });
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Serves the main app page with the badge builder UI.
 */
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

/**
 * Terms page - covers usage and legal stuff.
 */
app.get('/terms', (req, res) => {
  res.sendFile(__dirname + '/terms.html');
});

/**
 * Fire up the server. Logs the port for easy debugging.
 */
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);

  // Initialize persistent storage on server startup
  try {
    await initializeMemoryStorage();
    console.log('Persistent storage initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize persistent storage:', error.message);
  }
});