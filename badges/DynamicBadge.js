const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { generateIcon } = require('../utils/iconUtils');
const { generateBadgeSvg } = require('../utils/badgeUtils');

/**
 * Ensure storage directory exists
 * @returns {Promise<void>}
 */
async function ensureStorageDirectory() {
  try {
    await fs.access(STORAGE_PATH);
  } catch (error) {
    // Directory doesn't exist, try to create it
    try {
      await fs.mkdir(STORAGE_PATH, { recursive: true });
    } catch (mkdirError) {
      console.warn('Could not create storage directory, falling back to memory storage:', mkdirError.message);
    }
  }
}

/**
 * Get the file path for a repo's view count
 * @param {string} repo - The repo identifier
 * @returns {string} File path
 */
function getViewCountFilePath(repo) {
  return path.join(STORAGE_PATH, `${repo.replace('/', '-')}-views-count`);
}

/**
 * Read view count from file with fallback to memory
 * @param {string} repo - The repo identifier
 * @returns {Promise<number>} Current view count
 */
async function getViewCount(repo) {
  // Try file storage first
  const filePath = getViewCountFilePath(repo);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const count = parseInt(data.trim(), 10) || 0;
    // Sync memory storage
    memoryStorage.set(repo, count);
    return count;
  } catch (error) {
    // Fall back to memory storage
    return memoryStorage.get(repo) || 0;
  }
}

/**
 * Increment and save view count to file with memory fallback
 * @param {string} repo - The repo identifier
 * @returns {Promise<number>} New view count
 */
async function incrementViewCount(repo) {
  const currentCount = await getViewCount(repo);
  const newCount = currentCount + 1;

  // Update memory storage
  memoryStorage.set(repo, newCount);

  // Try to save to file
  const filePath = getViewCountFilePath(repo);
  try {
    await ensureStorageDirectory();

    // Also log the view with timestamp
    const logFilePath = path.join(STORAGE_PATH, `${repo.replace('/', '-')}-views`);
    const timestamp = new Date().toISOString();
    await fs.appendFile(logFilePath, `${timestamp}\n`);

    // Save the new count
    await fs.writeFile(filePath, newCount.toString(), 'utf8');
  } catch (error) {
    console.warn('File storage failed, using memory storage only:', error.message);
  }

  return newCount;
}

/**
 * Base class for dynamic badges that fetch data from external sources.
 * Subclasses should implement fetchData() to retrieve dynamic values.
 */
class DynamicBadge {
  constructor({ icon, bgColor = 'blue', iconColor, textColor = 'white', edges = 'squared' }) {
    this.icon = icon;
    this.bgColor = bgColor;
    this.iconColor = iconColor;
    this.textColor = textColor;
    this.edges = edges;
  }

  /**
   * Fetches dynamic data. Override in subclasses.
   * @returns {Promise<string>} The dynamic text for the badge
   */
  async fetchData() {
    throw new Error('fetchData() must be implemented by subclass');
  }

  /**
   * Generates the dynamic badge by fetching data and creating SVG.
   * @returns {Promise<string>} SVG badge
   */
  async generate() {
    const text = await this.fetchData();
    const iconData = await generateIcon(this.icon, this.iconColor);
    return generateBadgeSvg(text, this.bgColor, iconData, this.textColor, this.edges);
  }
}

/**
 * Dynamic badge for repository views (counts badge fetches as views).
 */
class GitHubViewersBadge extends DynamicBadge {
  constructor({ repo, ...options }) {
    super(options);
    this.repo = repo.toLowerCase(); // Normalize to lowercase for consistency
  }

  async fetchData() {
    const currentViews = await incrementViewCount(this.repo);
    return currentViews.toString();
  }
}

/**
 * Dynamic badge for GitHub stargazers (stars count).
 */
class GitHubStarsBadge extends DynamicBadge {
  constructor({ repo, ...options }) {
    super(options);
    this.repo = repo.toLowerCase(); // Normalize to lowercase
  }

  async fetchData() {
    try {
      const response = await axios.get(`https://api.github.com/repos/${this.repo}`);
      return response.data.stargazers_count.toString();
    } catch (error) {
      console.error('Error fetching GitHub stargazers:', error.message);
      return 'N/A';
    }
  }
}

/**
 * Example dynamic badge for downloads (npm package downloads).
 */
class DownloadsBadge extends DynamicBadge {
  constructor({ package: packageName, ...options }) {
    super(options);
    this.packageName = packageName;
  }

  async fetchData() {
    try {
      const response = await axios.get(`https://api.npmjs.org/downloads/point/last-month/${this.packageName}`);
      return response.data.downloads.toString();
    } catch (error) {
      console.error('Error fetching npm downloads:', error.message);
      return 'N/A';
    }
  }
}

/**
 * Example dynamic badge for time since last commit.
 */
class LastCommitBadge extends DynamicBadge {
  constructor({ repo, ...options }) {
    super(options);
    this.repo = repo.toLowerCase(); // Normalize to lowercase
  }

  async fetchData() {
    try {
      const response = await axios.get(`https://api.github.com/repos/${this.repo}/commits?per_page=1`);
      const lastCommitDate = new Date(response.data[0].commit.committer.date);
      const now = new Date();
      const diffTime = Math.abs(now - lastCommitDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return `${diffDays} days ago`;
    } catch (error) {
      console.error('Error fetching last commit:', error.message);
      return 'N/A';
    }
  }
}

/**
 * Example dynamic badge for open issues.
 */
class OpenIssuesBadge extends DynamicBadge {
  constructor({ repo, ...options }) {
    super(options);
    this.repo = repo.toLowerCase(); // Normalize to lowercase
  }

  async fetchData() {
    try {
      const response = await axios.get(`https://api.github.com/repos/${this.repo}`);
      return response.data.open_issues_count.toString();
    } catch (error) {
      console.error('Error fetching open issues:', error.message);
      return 'N/A';
    }
  }
}

module.exports = {
  DynamicBadge,
  GitHubViewersBadge,
  GitHubStarsBadge,
  DownloadsBadge,
  LastCommitBadge,
  OpenIssuesBadge
};