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

  const baseColor = whiteContrast > blackContrast ? 'white' : 'black';
  
  // Make the text color slightly lighter for better vibrancy
  if (baseColor === 'white') {
    return 'rgb(255, 255, 255)'; // Pure white
  } else {
    return 'rgb(180, 180, 180)'; // Even lighter gray
  }
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

// Enhanced color processing for better quality
function enhanceColorProcessing(svgString, targetColor) {
  if (!targetColor) return svgString;

  const finalColor = formatColorForSvg(targetColor);
  const rgb = parseColor(targetColor);

  // Simple and reliable color replacement - focus on main fill attributes
  let enhanced = svgString;

  // Check if this is a pixel image embedded in SVG (contains <image> tag)
  if (enhanced.includes('<image')) {
    // For pixel images, use a more vibrant colorization approach
    const vibrantFilter = `
        <filter id="vibrant-colorize">
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.3" intercept="0"/>
            <feFuncG type="linear" slope="1.3" intercept="0"/>
            <feFuncB type="linear" slope="1.3" intercept="0"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="0"/>
          <feColorMatrix type="matrix" values="0 0 0 0 ${rgb.r/255}
                                               0 0 0 0 ${rgb.g/255}
                                               0 0 0 0 ${rgb.b/255}
                                               0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent="1.4"/>
            <feFuncG type="gamma" amplitude="1" exponent="1.4"/>
            <feFuncB type="gamma" amplitude="1" exponent="1.4"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="1.5"/>
        </filter>`;
    
    // Add the filter to defs section
    enhanced = enhanced.replace('<defs>', `<defs>${vibrantFilter}`);
    
    // Apply the filter to the image element
    enhanced = enhanced.replace(/<image([^>]*?)\/>/g, (match, attrs) => {
      // Check if filter is already applied
      if (attrs.includes('filter=')) {
        return match.replace(/filter="[^"]*"/, `filter="url(#vibrant-colorize)"`);
      } else {
        return `<image${attrs} filter="url(#vibrant-colorize)"/>`;
      }
    });
    
    return enhanced;
  }

  // For pure SVG content, enhance colors to be more vibrant
  // First, add a brightness/saturation filter to the defs
  const vibrantSvgFilter = `
      <filter id="svg-vibrant">
        <feComponentTransfer>
          <feFuncR type="linear" slope="1.2" intercept="0"/>
          <feFuncG type="linear" slope="1.2" intercept="0"/>
          <feFuncB type="linear" slope="1.2" intercept="0"/>
        </feComponentTransfer>
        <feColorMatrix type="saturate" values="1.8"/>
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1" exponent="1.3"/>
          <feFuncG type="gamma" amplitude="1" exponent="1.3"/>
          <feFuncB type="gamma" amplitude="1" exponent="1.3"/>
        </feComponentTransfer>
      </filter>`;
  
  // Add the filter to defs section if it exists, otherwise create it
  if (enhanced.includes('<defs>')) {
    enhanced = enhanced.replace('<defs>', `<defs>${vibrantSvgFilter}`);
  } else {
    enhanced = enhanced.replace('<svg', `<svg><defs>${vibrantSvgFilter}</defs>`);
  }
  
  // Apply the filter to the main SVG element
  enhanced = enhanced.replace(/<svg([^>]*?)>/, (match, attrs) => {
    if (attrs.includes('filter=')) {
      return match.replace(/filter="[^"]*"/, `filter="url(#svg-vibrant)"`);
    } else {
      return `<svg${attrs} filter="url(#svg-vibrant)">`;
    }
  });
  // Replace fill attributes - be more conservative
  enhanced = enhanced.replace(/fill="([^"]*)"/gi, (match, value) => {
    const normalizedValue = value.trim().toLowerCase();
    // Preserve special values
    if (normalizedValue === 'none' ||
        normalizedValue === 'transparent' ||
        normalizedValue === 'currentcolor' ||
        normalizedValue.startsWith('url(') ||
        normalizedValue.includes('gradient')) {
      return match;
    }
    return `fill="${finalColor}"`;
  });

  // Replace stroke attributes
  enhanced = enhanced.replace(/stroke="([^"]*)"/gi, (match, value) => {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'none' ||
        normalizedValue === 'transparent' ||
        normalizedValue === 'currentcolor' ||
        normalizedValue.startsWith('url(') ||
        normalizedValue.includes('gradient')) {
      return match;
    }
    return `stroke="${finalColor}"`;
  });

  // Replace fill in style attributes
  enhanced = enhanced.replace(/style="([^"]*?)fill:\s*([^;"]+)([^"]*?)"/gi, (match, before, color, after) => {
    const normalizedColor = color.trim().toLowerCase();
    if (normalizedColor === 'none' ||
        normalizedColor === 'transparent' ||
        normalizedColor === 'currentcolor' ||
        normalizedColor.startsWith('url(') ||
        normalizedColor.includes('gradient')) {
      return match;
    }
    return `style="${before}fill: ${finalColor}${after}"`;
  });

  // Replace stroke in style attributes
  enhanced = enhanced.replace(/style="([^"]*?)stroke:\s*([^;"]+)([^"]*?)"/gi, (match, before, color, after) => {
    const normalizedColor = color.trim().toLowerCase();
    if (normalizedColor === 'none' ||
        normalizedColor === 'transparent' ||
        normalizedColor === 'currentcolor' ||
        normalizedColor.startsWith('url(') ||
        normalizedColor.includes('gradient')) {
      return match;
    }
    return `style="${before}stroke: ${finalColor}${after}"`;
  });

  return enhanced;
}

// =============================================================================
// IMAGE PROCESSING
// =============================================================================

async function fetchImage(url) {
  try {
    console.log('Fetching image:', url);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000, // Increased timeout for high-quality images
      maxContentLength: 5 * 1024 * 1024, // 5MB max for high-quality icons
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)',
        'Accept': 'image/svg+xml,image/png,image/jpeg,image/gif,image/webp,image/*;q=0.8,*/*;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    const buffer = Buffer.from(response.data);

    // Enhanced file size validation with better limits for quality
    if (buffer.length > 5 * 1024 * 1024) {
      console.warn('Image too large, but attempting to process:', buffer.length);
      // Don't immediately reject, try to process but with more conservative settings
    }

    // Additional content validation
    const contentType = response.headers['content-type'] || '';
    if (!contentType.startsWith('image/') && !isSvgBuffer(buffer)) {
      console.warn('Unexpected content type:', contentType);
    }

    return buffer;
  } catch (error) {
    console.error('Failed to fetch image:', error.message);
    
    // Implement retry logic for transient failures
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      console.log('Retrying image fetch...');
      try {
        const retryResponse = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
          }
        });
        return Buffer.from(retryResponse.data);
      } catch (retryError) {
        console.error('Retry failed:', retryError.message);
      }
    }
    
    return null;
  }
}

function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length === 0) return false;
  
  const start = buffer.toString('utf8', 0, Math.min(200, buffer.length));
  
  // Check for HTML error pages
  if (start.includes('<html') || start.includes('<!DOCTYPE') || start.includes('Error') || start.includes('<body')) {
    return false;
  }
  
  // Check for valid image signatures
  const signatures = {
    png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    jpeg: [0xFF, 0xD8, 0xFF],
    gif87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    gif89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    webp: [0x52, 0x49, 0x46, 0x46],
    svg: start.includes('<svg') || start.includes('<?xml')
  };
  
  // Check binary signatures
  for (const [format, signature] of Object.entries(signatures)) {
    if (format === 'svg') continue; // SVG is text-based
    
    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true;
    }
  }
  
  // Check for SVG
  if (signatures.svg) {
    return true;
  }
  
  return false;
}

function isSvgBuffer(buffer) {
  if (!buffer || buffer.length === 0) return false;
  
  const start = buffer.toString('utf8', 0, Math.min(300, buffer.length));
  const normalized = start.toLowerCase().trim();
  
  // More comprehensive SVG detection
  return normalized.includes('<svg') || 
         (normalized.includes('<?xml') && (normalized.includes('<svg') || normalized.includes('svg'))) ||
         (normalized.startsWith('<?xml') && normalized.includes('svg'));
}

async function processSvgImage(buffer, iconColor) {
  try {
    let svgString = buffer.toString('utf8');

    // Sanitize SVG for security while preserving all quality elements
    const window = new JSDOM('').window;
    let cleanSvg = DOMPurify(window).sanitize(svgString, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOW_TAGS: ['svg', 'path', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'g', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'filter', 'feColorMatrix', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode'],
      ALLOW_ATTR: ['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'viewBox', 'transform', 'style', 'id', 'class', 'values', 'type', 'gradientUnits', 'x1', 'y1', 'x2', 'y2', 'offset', 'stdDeviation', 'in', 'result']
    });

    // Extract original dimensions
    const viewBoxMatch = cleanSvg.match(/viewBox=["']([^"']+)["']/);
    const widthMatch = cleanSvg.match(/width=["']([^"']+)["']/);
    const heightMatch = cleanSvg.match(/height=["']([^"']+)["']/);

    let originalWidth = 24, originalHeight = 24, viewBoxX = 0, viewBoxY = 0;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/);
      if (parts.length >= 4) {
        viewBoxX = parseFloat(parts[0]) || 0;
        viewBoxY = parseFloat(parts[1]) || 0;
        originalWidth = parseFloat(parts[2]) || 24;
        originalHeight = parseFloat(parts[3]) || 24;
      }
    } else {
      if (widthMatch) originalWidth = parseFloat(widthMatch[1]) || 24;
      if (heightMatch) originalHeight = parseFloat(heightMatch[1]) || 24;
    }

    // Apply color processing if needed - but preserve SVG nature
    if (iconColor) {
      cleanSvg = enhanceColorProcessing(cleanSvg, iconColor);
    }

    // Remove any existing xmlns declarations to avoid conflicts
    cleanSvg = cleanSvg.replace(/\s*xmlns[^=]*="[^"]*"/g, '');

    // Create ultra-high-quality SVG - this stays as pure vector
    let enhancedSvg = cleanSvg
      .replace(/<svg[^>]*>/i, (match) => {
        // Extract existing attributes
        let attrs = match.replace(/<svg\s*/i, '').replace(/>\s*$/, '');

        // Add quality rendering attributes
        const qualityAttrs = [
          'shape-rendering="geometricPrecision"',
          'text-rendering="optimizeLegibility"',
          'image-rendering="optimizeQuality"',
          'color-rendering="optimizeQuality"',
          'xmlns="http://www.w3.org/2000/svg"'
        ].join(' ');

        return `<svg ${attrs} ${qualityAttrs}>`;
      });

    // Ensure proper viewBox for scaling
    if (!enhancedSvg.includes('viewBox')) {
      enhancedSvg = enhancedSvg.replace('<svg', `<svg viewBox="${viewBoxX} ${viewBoxY} ${originalWidth} ${originalHeight}"`);
    }

    // Calculate final dimensions (maintain aspect ratio but target 32px height)
    const aspectRatio = originalWidth / originalHeight;
    const targetHeight = 32;
    const targetWidth = Math.round(targetHeight * aspectRatio);

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(enhancedSvg).toString('base64')}`;

    console.log('Pure SVG processed (vector quality):', `${targetWidth}x${targetHeight}`, 'from', `${originalWidth}x${originalHeight}`);
    return { dataUri, width: targetWidth, height: targetHeight };
  } catch (error) {
    console.error('SVG processing failed:', error.message);
    return null;
  }
}async function processPixelImage(buffer, iconColor) {
  try {
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    console.log('Processing raster image:', metadata.format, `${metadata.width}x${metadata.height}`);

    // Use ultra-high working resolution for quality
    const workingSize = 512; // Much higher resolution for crisp results
    const aspectRatio = metadata.width / metadata.height;
    let workingWidth = workingSize;
    let workingHeight = workingSize;

    if (aspectRatio > 1) {
      workingHeight = Math.round(workingSize / aspectRatio);
    } else {
      workingWidth = Math.round(workingSize * aspectRatio);
    }

    // Ensure minimum working size for quality
    workingWidth = Math.max(workingWidth, 256);
    workingHeight = Math.max(workingHeight, 256);

    // Process with ultra-high quality settings
    const processedBuffer = await sharp(buffer)
      .resize(workingWidth, workingHeight, {
        fit: 'inside',
        withoutEnlargement: true, // Don't enlarge small images
        kernel: 'lanczos3',
        fastShrinkOnLoad: false
      })
      .normalize() // Enhance contrast
      .sharpen({ // Advanced sharpening for crisp edges
        sigma: 1.0,
        m1: 0.5,
        m2: 3.0,
        x1: 1,
        y2: 15,
        y3: 25
      })
      .gamma(1.1) // Slight gamma correction for better contrast
      .modulate({
        brightness: 1.05, // Slight brightness boost
        saturation: 1.1   // Slight saturation boost for vibrancy
      })
      .png({
        quality: 100,
        compressionLevel: 0,
        adaptiveFiltering: true,
        palette: false,
        progressive: false
      })
      .toBuffer();

    // Calculate final display size (higher than before for better quality)
    const displayHeight = 64; // Increased from 32px for much better quality
    const displayWidth = Math.round(displayHeight * aspectRatio);

    const base64 = processedBuffer.toString('base64');

    // Create SVG with ultra-high quality settings and proper scaling
    let svg = `<svg width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${displayWidth} ${displayHeight}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" image-rendering="optimizeQuality" color-rendering="optimizeQuality">
      <defs>
        <filter id="icon-enhance">
          <feColorMatrix type="saturate" values="1.1"/>
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent="0.9"/>
            <feFuncG type="gamma" amplitude="1" exponent="0.9"/>
            <feFuncB type="gamma" amplitude="1" exponent="0.9"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image href="data:image/png;base64,${base64}" width="${displayWidth}" height="${displayHeight}" filter="url(#icon-enhance)" style="image-rendering: -webkit-optimize-contrast; image-rendering: optimizeQuality;"/>
    </svg>`;

    // Apply color processing to the final SVG if iconColor is specified
    if (iconColor) {
      svg = enhanceColorProcessing(svg, iconColor);
    }

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    console.log('Ultra-high-quality raster processing:', displayWidth, 'x', displayHeight, 'from working size', workingWidth, 'x', workingHeight);
    return { dataUri, width: displayWidth, height: displayHeight };
  } catch (error) {
    console.error('High-quality raster processing failed:', error.message);
    return null;
  }
}

// =============================================================================
// BADGE GENERATION
// =============================================================================

async function processIcon(url, iconColor) {
  // Fetch and process image
  const buffer = await fetchImage(url);
  if (!buffer) return null;

  let result;
  if (isSvgBuffer(buffer)) {
    result = await processSvgImage(buffer, iconColor);
  } else {
    // Convert raster images to true vector paths
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

  const padding = 10; // Optimized padding for compact design
  const iconPadding = iconData ? 8 : 0; // Balanced icon spacing
  const textPadding = 12;

  let iconWidth = 0, iconHeight = 0;
  if (iconData) {
    // Compact size for minimal badges
    const maxHeight = 20; // Further reduced for even more compact badges
    if (iconData.height > maxHeight) {
      const scale = maxHeight / iconData.height;
      iconWidth = Math.round(iconData.width * scale);
      iconHeight = maxHeight;
    } else {
      iconWidth = iconData.width;
      iconHeight = iconData.height;
    }
  }

  const height = 32; // Adjusted badge height for compact design
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
    // Parse and format the textColor consistently, making it slightly lighter
    const parsedColor = parseColor(textColor);
    // Make the color 40% lighter for better vibrancy
    const lighterR = Math.min(255, Math.round(parsedColor.r * 1.4));
    const lighterG = Math.min(255, Math.round(parsedColor.g * 1.4));
    const lighterB = Math.min(255, Math.round(parsedColor.b * 1.4));
    finalTextColor = `rgb(${lighterR}, ${lighterG}, ${lighterB})`;
  } else {
    finalTextColor = getBestTextColor(bgColor);
  }
  const dims = calculateBadgeDimensions(text, iconData);

  const fontSize = '12'; // Slightly larger font for better readability
  const fontFamily = 'Verdana, system-ui, sans-serif';

  return `<svg width="${dims.totalWidth}" height="${dims.height}" viewBox="0 0 ${dims.totalWidth} ${dims.height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility" image-rendering="optimizeQuality" color-rendering="optimizeQuality">
    <rect width="${dims.totalWidth}" height="${dims.height}" fill="${bgColor}" rx="6" ry="6"/>
    ${iconData ? `<image href="${iconData.dataUri}" x="${dims.iconX}" y="${dims.iconY}" width="${dims.iconWidth}" height="${dims.iconHeight}" style="image-rendering: optimizeQuality;"/>` : ''}
    <text x="${dims.textX}" y="${dims.textY}" text-anchor="middle" fill="${finalTextColor}" font-size="${fontSize}" font-weight="600" font-family="${fontFamily}" style="text-rendering: optimizeLegibility; letter-spacing: 0.025em;">${text}</text>
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
  const parsedBgColor = parseColor(bgColor);
  // Make the background color more vibrant with brightness and saturation boost
  const vibrantR = Math.min(255, Math.round(parsedBgColor.r * 1.3));
  const vibrantG = Math.min(255, Math.round(parsedBgColor.g * 1.3));
  const vibrantB = Math.min(255, Math.round(parsedBgColor.b * 1.3));
  const finalBgColor = `rgb(${vibrantR}, ${vibrantG}, ${vibrantB})`;

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