const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const app = express();
const port = process.env.PORT || 3000;

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
  if (typeof color !== 'string') {
    return COLORS.white;
  }
  
  // Handle hex colors - accept both with and without # prefix
  let hex = color;
  if (color.startsWith('#')) {
    hex = color.slice(1);
  } else if (/^[0-9A-Fa-f]{6}$/.test(color)) {
    // If it's a 6-character hex string without #, treat it as hex
    hex = color;
  } else {
    // Handle named colors
    return COLORS[color.toLowerCase()] || COLORS.white;
  }
  
  // Validate hex format (6 characters)
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return COLORS.white;
  }
  
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16)
  };
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

function isHexColor(color) {
  if (typeof color !== 'string') return false;
  // Check if it starts with # or is a 6-character hex string
  return color.startsWith('#') || /^[0-9A-Fa-f]{6}$/.test(color);
}

function formatColorForSvg(color) {
  if (isHexColor(color)) {
    return color.startsWith('#') ? color : `#${color}`;
  } else {
    const parsedColor = parseColor(color);
    return `rgb(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b})`;
  }
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

async function processSvgImage(buffer, iconColor) {
  try {
    let svgString = buffer.toString('utf8');

    // Sanitize SVG for security
    const window = new JSDOM('').window;
    let cleanSvg = DOMPurify(window).sanitize(svgString, {
      USE_PROFILES: { svg: true, svgFilters: true }
    });

    // Recolor if iconColor specified
    if (iconColor) {
      // Parse and format the color consistently
      const finalColor = formatColorForSvg(iconColor);

      // Replace fill attributes
      cleanSvg = cleanSvg.replace(/fill="([^"]*)"/g, (match, value) => {
        if (value !== 'none' && !value.startsWith('url(') && value !== 'currentColor') {
          return `fill="${finalColor}"`;
        }
        return match;
      });
      
      // Replace stroke attributes
      cleanSvg = cleanSvg.replace(/stroke="([^"]*)"/g, (match, value) => {
        if (value !== 'none' && !value.startsWith('url(') && value !== 'currentColor') {
          return `stroke="${finalColor}"`;
        }
        return match;
      });
      
      // Replace in style attributes
      cleanSvg = cleanSvg.replace(/style="([^"]*)"/g, (match, style) => {
        let newStyle = style.replace(/fill:\s*([^;#]+)(?=[;\s]|$)/g, (fillMatch, fillValue) => {
          if (fillValue.trim() !== 'none' && !fillValue.includes('url(') && fillValue.trim() !== 'currentColor') {
            return `fill: ${finalColor}`;
          }
          return fillMatch;
        });
        newStyle = newStyle.replace(/stroke:\s*([^;#]+)(?=[;\s]|$)/g, (strokeMatch, strokeValue) => {
          if (strokeValue.trim() !== 'none' && !strokeValue.includes('url(') && strokeValue.trim() !== 'currentColor') {
            return `stroke: ${finalColor}`;
          }
          return strokeMatch;
        });
        return `style="${newStyle}"`;
      });
    }

    // Extract dimensions
    const viewBoxMatch = cleanSvg.match(/viewBox=["']([^"']+)["']/);
    let width = 32, height = 32;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/);
      if (parts.length >= 4) {
        width = parseFloat(parts[2]) || 32;
        height = parseFloat(parts[3]) || 32;
      }
    }

    // Standardize to 32x32
    width = 32;
    height = 32;

    // Create enhanced SVG
    let enhancedSvg = cleanSvg
      .replace('<svg', '<svg shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"');

    if (!enhancedSvg.includes('viewBox')) {
      enhancedSvg = enhancedSvg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
    }

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(enhancedSvg).toString('base64')}`;

    console.log('Processed SVG:', width, 'x', height);
    return { dataUri, width, height };
  } catch (error) {
    console.error('SVG processing failed:', error.message);
    return null;
  }
}

async function processPixelImage(buffer, iconColor) {
  try {
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    console.log('Processing image:', metadata.format, `${metadata.width}x${metadata.height}`);

    // Calculate target size
    const baseHeight = 32;
    const aspectRatio = metadata.width / metadata.height;
    let targetWidth = Math.round(baseHeight * aspectRatio);
    let targetHeight = baseHeight;

    const maxWidth = 128;
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(targetWidth / aspectRatio);
    }

    // Convert to SVG-like format by tracing/vectorizing the image
    // For now, we'll create a simplified approach using the image as a mask
    // and applying the color as a fill
    
    if (iconColor) {
      // Parse and format the color consistently
      const finalColor = formatColorForSvg(iconColor);

      // Process image to get alpha channel and create a colored SVG
      const processedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3'
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = processedBuffer;
      const { width, height, channels } = info;

      // Create SVG paths from the alpha channel
      let paths = '';
      const threshold = 128; // Alpha threshold for considering a pixel "solid"
      
      // Simple approach: create rectangles for each solid pixel
      // This is basic but works for simple icons
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * channels;
          const alpha = data[pixelIndex + 3]; // Alpha channel
          
          if (alpha > threshold) {
            paths += `<rect x="${x}" y="${y}" width="1" height="1" fill="${finalColor}" opacity="${alpha / 255}"/>`;
          }
        }
      }

      // Create SVG with the colored paths
      const svg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
        ${paths}
      </svg>`;

      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

      console.log('Converted pixel image to colored SVG:', targetWidth, 'x', targetHeight);
      return { dataUri, width: targetWidth, height: targetHeight };
    } else {
      // No color specified, just convert to SVG wrapper (original behavior)
      const processedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3'
        })
        .png({ quality: 100, compressionLevel: 0 })
        .toBuffer();

      const base64 = processedBuffer.toString('base64');
      const svg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" xmlns="http://www.w3.org/2000/svg">
        <image href="data:image/png;base64,${base64}" width="${targetWidth}" height="${targetHeight}" style="image-rendering: crisp-edges;"/>
      </svg>`;

      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

      console.log('Processed pixel image to SVG wrapper:', targetWidth, 'x', targetHeight);
      return { dataUri, width: targetWidth, height: targetHeight };
    }
  } catch (error) {
    console.error('Pixel image processing failed:', error.message);
    return null;
  }
}

async function processIcon(url, iconColor) {
  // Fetch and process image
  const buffer = await fetchImage(url);
  if (!buffer) return null;

  let result;
  if (isSvgBuffer(buffer)) {
    result = await processSvgImage(buffer, iconColor);
  } else {
    // Now pixel images can also be recolored by converting them to SVG
    result = await processPixelImage(buffer, iconColor);
  }

  return result;
}

// =============================================================================
// BADGE GENERATION
// =============================================================================

function calculateBadgeDimensions(text, iconData) {
  const fontFamily = 'Verdana, system-ui, sans-serif';
  const avgCharWidth = 10.0;
  const textWidth = Math.ceil(text.length * avgCharWidth);

  const padding = 10;
  const iconPadding = iconData ? 8 : 0;
  const textPadding = 12;

  let iconWidth = 0, iconHeight = 0;
  if (iconData) {
    const maxHeight = 16;
    if (iconData.height > maxHeight) {
      const scale = maxHeight / iconData.height;
      iconWidth = Math.round(iconData.width * scale);
      iconHeight = maxHeight;
    } else {
      iconWidth = iconData.width;
      iconHeight = iconData.height;
    }
  }

  const height = 32;
  const totalWidth = padding + iconWidth + iconPadding + textWidth + textPadding;

  return {
    totalWidth,
    height,
    iconWidth,
    iconHeight,
    textWidth,
    padding,
    iconPadding,
    iconX: padding,
    iconY: Math.round((height - iconHeight) / 2),
    textX: Math.round(padding + iconWidth + iconPadding + textWidth / 2),
    textY: Math.round(height / 2 + 4)
  };
}

function generateBadgeSvg(text, bgColor, iconData, textColor) {
  let finalTextColor;
  if (textColor && textColor !== 'auto') {
    // Parse and format the textColor consistently
    finalTextColor = formatColorForSvg(textColor);
  } else {
    finalTextColor = getBestTextColor(bgColor);
  }
  const dims = calculateBadgeDimensions(text, iconData);

  const fontSize = '11';
  const fontFamily = 'Verdana, system-ui, sans-serif';

  return `<svg width="${dims.totalWidth}" height="${dims.height}" viewBox="0 0 ${dims.totalWidth} ${dims.height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
    <rect width="${dims.totalWidth}" height="${dims.height}" fill="${bgColor}"/>
    ${iconData ? `<image href="${iconData.dataUri}" x="${dims.iconX}" y="${dims.iconY}" width="${dims.iconWidth}" height="${dims.iconHeight}" style="image-rendering: crisp-edges;"/>` : ''}
    <text x="${dims.textX}" y="${dims.textY}" text-anchor="middle" fill="${finalTextColor}" font-size="${fontSize}" font-weight="700" font-family="${fontFamily}" style="text-rendering: optimizeLegibility; letter-spacing: 0.1em;">${text}</text>
  </svg>`;
}

// =============================================================================
// ROUTES
// =============================================================================

app.get('/badge', async (req, res) => {
  const {
    text = 'Badge',
    bgColor = 'white',
    icon,
    iconColor,
    textColor
  } = req.query;

  // Parse bgColor to handle both hex and named colors
  const finalBgColor = formatColorForSvg(bgColor);

  // Process icon if provided
  let iconData = null;
  if (icon) {
    iconData = await processIcon(icon, iconColor);
  }

  // Generate SVG badge
  const svg = generateBadgeSvg(text, finalBgColor, iconData, textColor);

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