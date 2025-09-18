const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const sharp = require('sharp');
const { LRUCache } = require('lru-cache');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const app = express();
const port = process.env.PORT || 3000;

// Simple cache setup
const logoCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 60 // 1 hour
});

// Basic rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
}));

// =============================================================================
// COLOR UTILITIES
// =============================================================================

const COLORS = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  orange: { r: 255, g: 165, b: 0 },
  pink: { r: 255, g: 192, b: 203 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 }
};

function parseColor(color) {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16)
    };
  }
  
  // Handle named colors
  return COLORS[color.toLowerCase()] || COLORS.blue;
}

function getLuminance(r, g, b) {
  const normalize = (val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

function getContrastRatio(color1, color2) {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);
  
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

function getBestTextColor(backgroundColor) {
  const whiteContrast = getContrastRatio(backgroundColor, 'white');
  const blackContrast = getContrastRatio(backgroundColor, 'black');
  
  return whiteContrast > blackContrast ? 'white' : 'black';
}

function createMatteColor(color) {
  const rgb = parseColor(color);
  const average = (rgb.r + rgb.g + rgb.b) / 3;
  const factor = 0.3; // Desaturation amount
  
  const r = Math.round(rgb.r + (average - rgb.r) * factor);
  const g = Math.round(rgb.g + (average - rgb.g) * factor);
  const b = Math.round(rgb.b + (average - rgb.b) * factor);
  
  return `rgb(${r}, ${g}, ${b})`;
}

// =============================================================================
// IMAGE PROCESSING
// =============================================================================

async function fetchImage(url) {
  try {
    console.log('Fetching image:', url);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
      }
    });
    
    const buffer = Buffer.from(response.data);
    
    // Check for reasonable file size (2MB max)
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error('Image too large');
    }
    
    return buffer;
  } catch (error) {
    console.error('Failed to fetch image:', error.message);
    return null;
  }
}

function isValidImageBuffer(buffer) {
  const start = buffer.toString('utf8', 0, Math.min(100, buffer.length));
  return !start.includes('<html') && !start.includes('<!DOCTYPE') && !start.includes('Error');
}

function isSvgBuffer(buffer) {
  const start = buffer.toString('utf8', 0, Math.min(200, buffer.length));
  return start.includes('<svg') || start.includes('<?xml');
}

async function processSvgImage(buffer, quality) {
  try {
    const svgString = buffer.toString('utf8');
    
    // Sanitize SVG for security
    const window = new JSDOM('').window;
    const cleanSvg = DOMPurify(window).sanitize(svgString, {
      USE_PROFILES: { svg: true, svgFilters: true }
    });

    // Extract dimensions
    const viewBoxMatch = cleanSvg.match(/viewBox=["']([^"']+)["']/);
    const widthMatch = cleanSvg.match(/width=["']?([0-9.]+)["']?/);
    const heightMatch = cleanSvg.match(/height=["']?([0-9.]+)["']?/);

    let width = 32, height = 32;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/);
      if (parts.length >= 4) {
        width = parseFloat(parts[2]) || 32;
        height = parseFloat(parts[3]) || 32;
      }
    } else if (widthMatch && heightMatch) {
      width = parseFloat(widthMatch[1]) || 32;
      height = parseFloat(heightMatch[1]) || 32;
    }

    // Apply quality scaling
    const scale = quality === 'ultra' ? 1.8 : quality === 'high' ? 1.5 : 1.2;
    width = Math.round(Math.max(24, Math.min(width, 512)) * scale);
    height = Math.round(Math.max(24, Math.min(height, 512)) * scale);

    // Create enhanced SVG with quality attributes
    let enhancedSvg = cleanSvg
      .replace('<svg', '<svg shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"');
    
    if (!enhancedSvg.includes('viewBox')) {
      enhancedSvg = enhancedSvg.replace('<svg', `<svg viewBox="0 0 ${width / scale} ${height / scale}"`);
    }

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(enhancedSvg).toString('base64')}`;
    
    console.log('Processed SVG:', width, 'x', height);
    return { dataUri, width, height };
  } catch (error) {
    console.error('SVG processing failed:', error.message);
    return null;
  }
}

async function processPixelImage(buffer, quality) {
  try {
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    console.log('Processing image:', metadata.format, `${metadata.width}x${metadata.height}`);
    
    // Calculate target size
    const baseHeight = quality === 'ultra' ? 48 : quality === 'high' ? 40 : 32;
    const aspectRatio = metadata.width / metadata.height;
    let targetWidth = Math.round(baseHeight * aspectRatio);
    let targetHeight = baseHeight;
    
    const maxWidth = quality === 'ultra' ? 256 : 192;
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(targetWidth / aspectRatio);
    }

    // Process image with Sharp
    const processedBuffer = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3'
      })
      .modulate({ brightness: 1.02, saturation: 1.06 })
      .sharpen()
      .png({ quality: 100, compressionLevel: 0 })
      .toBuffer();

    // Create SVG wrapper for better rendering
    const base64 = processedBuffer.toString('base64');
    const svg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" xmlns="http://www.w3.org/2000/svg">
      <image href="data:image/png;base64,${base64}" width="${targetWidth}" height="${targetHeight}" style="image-rendering: crisp-edges;"/>
    </svg>`;

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    
    console.log('Processed pixel image:', targetWidth, 'x', targetHeight);
    return { dataUri, width: targetWidth, height: targetHeight };
  } catch (error) {
    console.error('Pixel image processing failed:', error.message);
    return null;
  }
}

async function processLogo(url, quality = 'high') {
  const cacheKey = `${url}_${quality}`;
  
  // Check cache first
  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey);
  }
  
  // Fetch and process image
  const buffer = await fetchImage(url);
  if (!buffer) return null;
  
  let result;
  if (isSvgBuffer(buffer)) {
    result = await processSvgImage(buffer, quality);
  } else {
    result = await processPixelImage(buffer, quality);
  }
  
  // Cache result
  if (result) {
    logoCache.set(cacheKey, result);
  }
  
  return result;
}

// =============================================================================
// BADGE GENERATION
// =============================================================================

function calculateBadgeDimensions(text, logoData, quality) {
  const fontFamily = 'Verdana, system-ui, sans-serif';
  const avgCharWidth = fontFamily.includes('monospace') ? 9.0 : 8.5;
  const textWidth = Math.ceil(text.length * avgCharWidth);
  
  const padding = quality === 'ultra' ? 20 : 18;
  const logoPadding = logoData ? (quality === 'ultra' ? 16 : 14) : 0;
  const textPadding = quality === 'ultra' ? 18 : 16;
  
  let logoWidth = 0, logoHeight = 0;
  if (logoData) {
    const maxHeight = quality === 'ultra' ? 20 : quality === 'high' ? 18 : 16;
    if (logoData.height > maxHeight) {
      const scale = maxHeight / logoData.height;
      logoWidth = Math.round(logoData.width * scale);
      logoHeight = maxHeight;
    } else {
      logoWidth = logoData.width;
      logoHeight = logoData.height;
    }
  }
  
  const height = Math.max(quality === 'ultra' ? 34 : 30, logoHeight + 8);
  const totalWidth = padding + logoWidth + logoPadding + textWidth + textPadding;
  
  return {
    totalWidth,
    height,
    logoWidth,
    logoHeight,
    textWidth,
    padding,
    logoPadding,
    logoX: padding,
    logoY: Math.round((height - logoHeight) / 2),
    textX: Math.round(padding + logoWidth + logoPadding + textWidth / 2),
    textY: Math.round(height / 2 + (quality === 'ultra' ? 4 : 3.5))
  };
}

function generateBadgeSvg(text, color, logoData, textColor, quality, autoContrast) {
  const finalTextColor = autoContrast === 'true' ? getBestTextColor(color) : textColor;
  const matteColor = createMatteColor(color);
  const dims = calculateBadgeDimensions(text, logoData, quality);
  
  const fontSize = quality === 'ultra' ? '11' : '10';
  const fontFamily = 'Verdana, system-ui, sans-serif';
  
  return `<svg width="${dims.totalWidth}" height="${dims.height}" viewBox="0 0 ${dims.totalWidth} ${dims.height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
    <rect width="${dims.totalWidth}" height="${dims.height}" fill="${matteColor}"/>
    ${logoData ? `<image href="${logoData.dataUri}" x="${dims.logoX}" y="${dims.logoY}" width="${dims.logoWidth}" height="${dims.logoHeight}" style="image-rendering: crisp-edges;"/>` : ''}
    <text x="${dims.textX}" y="${dims.textY}" text-anchor="middle" fill="${finalTextColor}" font-size="${fontSize}" font-weight="700" font-family="${fontFamily}" style="text-rendering: optimizeLegibility;">${text}</text>
  </svg>`;
}

// =============================================================================
// ROUTES
// =============================================================================

app.get('/badge', async (req, res) => {
  const {
    text = 'Badge',
    color = 'blue',
    logo,
    textColor = 'white',
    autoContrast = 'true',
    logoQuality = 'high'
  } = req.query;
  
  // Process logo if provided
  let logoData = null;
  if (logo) {
    logoData = await processLogo(logo, logoQuality);
  }
  
  // Generate SVG badge
  const svg = generateBadgeSvg(text, color, logoData, textColor, logoQuality, autoContrast);
  
  // Send response
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/terms', (req, res) => {
  res.sendFile(__dirname + '/terms.html');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});