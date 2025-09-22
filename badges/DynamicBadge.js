const axios = require('axios');
const { generateIcon } = require('../utils/iconUtils');
const { generateBadgeSvg } = require('../utils/badgeUtils');

// Storage for repo view counts (in-memory, resets on server restart)
const repoViews = new Map();

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
    this.repo = repo; // e.g., 'owner/repo'
  }

  async fetchData() {
    if (!repoViews.has(this.repo)) {
      repoViews.set(this.repo, 0);
    }
    const currentViews = repoViews.get(this.repo) + 1;
    repoViews.set(this.repo, currentViews);
    return currentViews.toString();
  }
}

/**
 * Dynamic badge for GitHub stargazers (stars count).
 */
class GitHubStarsBadge extends DynamicBadge {
  constructor({ repo, ...options }) {
    super(options);
    this.repo = repo; // e.g., 'owner/repo'
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
    this.repo = repo;
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
    this.repo = repo;
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