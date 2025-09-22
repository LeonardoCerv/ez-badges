const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { generateIcon } = require('../utils/iconUtils');
const { generateBadgeSvg } = require('../utils/badgeUtils');

// Storage path for persistent view counts (fallback for local development)
const STORAGE_PATH = path.join(__dirname, '..', 'storage');

// In-memory fallback for environments where persistent storage fails
const memoryStorage = new Map();

// Redis client (Heroku Redis primary, Upstash fallback)
let redisClient = null;
let redisStorageAvailable = false;

// PostgreSQL client (backup storage)
let postgresClient = null;
let postgresStorageAvailable = false;

// Initialize Redis client (Heroku Redis first, then Upstash fallback)
try {
  let redisUrl = process.env.REDIS_URL; // Heroku Redis

  if (!redisUrl) {
    // Fallback to Upstash
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = require('@upstash/redis');
      redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      redisStorageAvailable = true;
      console.log('Upstash Redis storage initialized successfully');
    }
  } else {
    // Use Heroku Redis with TLS configuration
    const { createClient } = require('redis');
    redisClient = createClient({
      url: redisUrl,
      socket: {
        tls: true,
        rejectUnauthorized: false,
        // Add connection timeout and keep alive
        connectTimeout: 60000,
        commandTimeout: 5000,
        keepAlive: 30000,
        lazyConnect: true
      },
      // Disable automatic reconnection to prevent crashes
      retry_strategy: null
    });

    // Add error event handler to prevent unhandled exceptions
    redisClient.on('error', (err) => {
      console.warn('Redis client error (non-fatal):', err.message);
      redisStorageAvailable = false;
    });

    redisClient.on('end', () => {
      console.warn('Redis connection ended');
      redisStorageAvailable = false;
    });

    try {
      await redisClient.connect();
      redisStorageAvailable = true;
      console.log('Heroku Redis storage initialized successfully');
    } catch (connectError) {
      console.warn('Failed to connect to Heroku Redis:', connectError.message);
      redisStorageAvailable = false;
    }
  }
} catch (error) {
  console.warn('Redis client initialization failed, falling back to file/memory storage:', error.message);
}

// Initialize PostgreSQL client (backup storage)
try {
  if (process.env.DATABASE_URL) {
    const { Client } = require('pg');
    postgresClient = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Required for Heroku Postgres
    });
    postgresClient.connect();
    postgresStorageAvailable = true;
    console.log('PostgreSQL backup storage initialized successfully');

    // Create table if it doesn't exist
    postgresClient.query(`
      CREATE TABLE IF NOT EXISTS view_counts (
        repo VARCHAR(255) PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
} catch (error) {
  console.warn('PostgreSQL client initialization failed:', error.message);
}

// Flag to track if file storage is available (for local development)
let fileStorageAvailable = true;

// Detect serverless environments where file system is read-only
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT;

// Disable file storage in serverless environments
if (isServerless) {
  fileStorageAvailable = false;
  console.log('Serverless environment detected, disabling file storage');
}

/**
 * Initialize memory storage by loading all existing data from Redis, PostgreSQL, and/or files
 * This ensures persistence across server restarts and deployments
 */
async function initializeMemoryStorage() {
  console.log('Initializing persistent storage...');

  // First, try to load from Redis (Heroku Redis or Upstash)
  if (redisStorageAvailable && redisClient) {
    try {
      let keys;
      if (redisClient instanceof require('@upstash/redis').Redis) {
        // Upstash Redis
        keys = await redisClient.keys('views:*');
      } else {
        // Heroku Redis - use KEYS command instead of SCAN for simplicity
        try {
          if (redisClient.isOpen) {
            keys = await redisClient.keys('views:*');
          } else {
            throw new Error('Redis connection not available');
          }
        } catch (scanError) {
          console.warn('Redis KEYS command failed, skipping Redis data loading:', scanError.message);
          keys = [];
        }
      }

      console.log(`Found ${keys.length} view records in Redis`);

      for (const key of keys) {
        try {
          let count;
          if (redisClient instanceof require('@upstash/redis').Redis) {
            count = await redisClient.get(key);
          } else {
            // Heroku Redis - check if connected first
            if (redisClient.isOpen) {
              count = await redisClient.get(key);
            } else {
              throw new Error('Redis connection not available');
            }
          }

          if (count !== null) {
            const repo = key.replace('views:', '');
            const numCount = parseInt(count, 10) || 0;
            memoryStorage.set(repo, numCount);
          }
        } catch (keyError) {
          console.warn(`Failed to load Redis key ${key}:`, keyError.message);
        }
      }

      console.log(`Loaded ${memoryStorage.size} repositories from Redis`);
      return; // If Redis worked, we don't need to load from other sources
    } catch (redisError) {
      console.warn('Redis initialization failed, falling back to PostgreSQL:', redisError.message);
      // Mark Redis as unavailable for this session
      redisStorageAvailable = false;
    }
  }

  // Try to load from PostgreSQL backup
  if (postgresStorageAvailable && postgresClient) {
    try {
      const result = await postgresClient.query('SELECT repo, count FROM view_counts');
      console.log(`Found ${result.rows.length} view records in PostgreSQL`);

      for (const row of result.rows) {
        memoryStorage.set(row.repo, row.count);
      }

      console.log(`Loaded ${memoryStorage.size} repositories from PostgreSQL`);
      return; // If PostgreSQL worked, we don't need to load from files
    } catch (postgresError) {
      console.warn('PostgreSQL initialization failed, falling back to file storage:', postgresError.message);
      // Mark PostgreSQL as unavailable for this session
      postgresStorageAvailable = false;
    }
  }

  // Fallback to file storage for local development only
  if (!fileStorageAvailable || isServerless) return;

  try {
    await ensureStorageDirectory();

    // Read all view count files and load into memory
    const files = await fs.readdir(STORAGE_PATH);
    const countFiles = files.filter(file => file.endsWith('-views-count'));

    for (const countFile of countFiles) {
      try {
        const repo = countFile.replace('-views-count', '').replace(/-/g, '/');
        const filePath = path.join(STORAGE_PATH, countFile);
        const data = await fs.readFile(filePath, 'utf8');
        const count = parseInt(data.trim(), 10) || 0;
        memoryStorage.set(repo, count);
        console.log(`Loaded ${count} views for ${repo} from file storage`);
      } catch (fileError) {
        console.warn(`Failed to load count file ${countFile}:`, fileError.message);
      }
    }

    console.log(`Initialized memory storage with ${memoryStorage.size} repositories from files`);
  } catch (error) {
    console.warn('Failed to initialize memory storage from files:', error.message);
  }
}

/**
 * Ensure storage directory exists
 * @returns {Promise<void>}
 */
async function ensureStorageDirectory() {
  if (!fileStorageAvailable) return;

  try {
    await fs.access(STORAGE_PATH);
  } catch (error) {
    // Directory doesn't exist, try to create it
    try {
      await fs.mkdir(STORAGE_PATH, { recursive: true });
    } catch (mkdirError) {
      console.warn('Could not create storage directory, falling back to memory storage:', mkdirError.message);
      fileStorageAvailable = false;
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
 * Read view count from storage (Redis primary, PostgreSQL backup, file fallback, memory last resort)
 * @param {string} repo - The repo identifier
 * @returns {Promise<number>} Current view count
 */
async function getViewCount(repo) {
  const key = `views:${repo}`;

  // Try Redis first (Heroku Redis or Upstash)
  if (redisStorageAvailable && redisClient) {
    try {
      let count;
      if (redisClient instanceof require('@upstash/redis').Redis) {
        // Upstash Redis
        count = await redisClient.get(key);
      } else {
        // Heroku Redis - check if connected first
        if (redisClient.isOpen) {
          count = await redisClient.get(key);
        } else {
          throw new Error('Redis connection not available');
        }
      }

      if (count !== null) {
        const numCount = parseInt(count, 10) || 0;
        // Sync memory storage for faster subsequent access
        memoryStorage.set(repo, numCount);
        return numCount;
      }
    } catch (error) {
      console.warn('Redis get failed, falling back to PostgreSQL:', error.message);
      redisStorageAvailable = false; // Mark as unavailable
    }
  }

  // Try PostgreSQL backup
  if (postgresStorageAvailable && postgresClient) {
    try {
      const result = await postgresClient.query('SELECT count FROM view_counts WHERE repo = $1', [repo]);
      if (result.rows.length > 0) {
        const count = result.rows[0].count;
        // Sync memory storage
        memoryStorage.set(repo, count);
        return count;
      }
    } catch (error) {
      console.warn('PostgreSQL get failed:', error.message);
    }
  }

  // Try file storage if available (only in local development)
  if (fileStorageAvailable && !isServerless) {
    const filePath = getViewCountFilePath(repo);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const count = parseInt(data.trim(), 10) || 0;
      // Sync memory storage
      memoryStorage.set(repo, count);
      return count;
    } catch (error) {
      // File doesn't exist or can't be read, check memory
      if (memoryStorage.has(repo)) {
        return memoryStorage.get(repo);
      }
      // Neither file nor memory has data, return 0
      return 0;
    }
  }

  // Fall back to memory storage
  return memoryStorage.get(repo) || 0;
}

async function incrementViewCount(repo) {
  try {
    const currentCount = await getViewCount(repo);
    const newCount = currentCount + 1;

    // Update memory storage immediately
    memoryStorage.set(repo, newCount);

    const key = `views:${repo}`;

    // Try to save to Redis first (Heroku Redis or Upstash)
    if (redisStorageAvailable && redisClient) {
      try {
        if (redisClient instanceof require('@upstash/redis').Redis) {
          // Upstash Redis
          await redisClient.set(key, newCount.toString());
        } else {
          // Heroku Redis - check if connected first
          if (redisClient.isOpen) {
            await redisClient.set(key, newCount);
          } else {
            throw new Error('Redis connection not available');
          }
        }
      } catch (redisError) {
        console.warn('Redis save failed, falling back to PostgreSQL:', redisError.message);
        redisStorageAvailable = false; // Mark as unavailable
      }
    }

    // Try to save to PostgreSQL backup
    if (postgresStorageAvailable && postgresClient) {
      try {
        await postgresClient.query(`
          INSERT INTO view_counts (repo, count, updated_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (repo) DO UPDATE SET
            count = EXCLUDED.count,
            updated_at = CURRENT_TIMESTAMP
        `, [repo, newCount]);
      } catch (postgresError) {
        console.warn('PostgreSQL save failed:', postgresError.message);
      }
    }

    // Try to save to file (only in local development, not serverless)
    if (fileStorageAvailable && !isServerless) {
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
        console.warn('File storage failed, continuing with memory storage:', error.message);
      }
    }

    return newCount;
  } catch (error) {
    console.error('Error in incrementViewCount:', error);
    // Fallback to memory-only operation
    const currentCount = memoryStorage.get(repo) || 0;
    const newCount = currentCount + 1;
    memoryStorage.set(repo, newCount);
    return newCount;
  }
}

/**
 * Base class for dynamic badges that fetch data from external sources.
 * Subclasses should implement fetchData() to retrieve dynamic values.
 */
class DynamicBadge {
  constructor({ text, icon, bgColor = 'blue', iconColor, textColor = 'white', edges = 'squared' }) {
    this.text = text; // Custom text prefix
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
    try {
      const dynamicValue = await this.fetchData();
      let displayText = dynamicValue;

      // If custom text is provided, combine it with the dynamic value
      if (this.text) {
        displayText = `${this.text}: ${dynamicValue}`;
      }

      let iconData = null;

      if (this.icon) {
        try {
          iconData = await generateIcon(this.icon, this.iconColor);
        } catch (iconError) {
          console.warn('Icon generation failed, proceeding without icon:', iconError.message);
        }
      }

      return generateBadgeSvg(displayText, this.bgColor, iconData, this.textColor, this.edges);
    } catch (error) {
      console.error('Error in DynamicBadge.generate:', error);
      // Return a simple error badge
      return generateBadgeSvg('Error', 'red', null, 'white', 'squared');
    }
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
    try {
      const currentViews = await incrementViewCount(this.repo);
      return currentViews.toString();
    } catch (error) {
      console.error('Error in GitHubViewersBadge.fetchData:', error);
      return '0'; // Fallback
    }
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
  OpenIssuesBadge,
  initializeMemoryStorage
};