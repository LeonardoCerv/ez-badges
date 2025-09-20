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
  black:         { r: 0, g: 0, b: 0 },
  white:         { r: 255, g: 255, b: 255 },

  // Grays & Neutrals
  grayLight:     { r: 245, g: 245, b: 247 },
  gray:          { r: 128, g: 128, b: 128 },
  grayDark:      { r: 64, g: 64, b: 64 },
  slate:         { r: 112, g: 128, b: 144 },
  charcoal:      { r: 54, g: 69, b: 79 },

  // Blues
  blue:          { r: 0, g: 122, b: 255 },
  lightBlue:     { r: 173, g: 216, b: 230 },
  skyBlue:       { r: 135, g: 206, b: 235 },
  teal:          { r: 0, g: 150, b: 136 },
  cyan:          { r: 0, g: 188, b: 212 },

  // Greens
  green:         { r: 76, g: 175, b: 80 },
  mint:          { r: 152, g: 251, b: 152 },
  seafoam:       { r: 120, g: 219, b: 226 },
  olive:         { r: 128, g: 128, b: 0 },
  emerald:       { r: 80, g: 200, b: 120 },

  // Yellows & Oranges
  yellow:        { r: 255, g: 235, b: 59 },
  amber:         { r: 255, g: 191, b: 0 },
  orange:        { r: 255, g: 152, b: 0 },
  peach:         { r: 255, g: 218, b: 185 },
  gold:          { r: 255, g: 215, b: 0 },

  // Reds & Pinks
  red:           { r: 244, g: 67, b: 54 },
  coral:         { r: 255, g: 127, b: 80 },
  salmon:        { r: 250, g: 128, b: 114 },
  pink:          { r: 255, g: 192, b: 203 },
  rose:          { r: 255, g: 102, b: 102 },

  // Purples
  purple:        { r: 156, g: 39, b: 176 },
  lavender:      { r: 230, g: 230, b: 250 },
  lilac:         { r: 200, g: 162, b: 200 },
  violet:        { r: 148, g: 0, b: 211 },
  indigo:        { r: 75, g: 0, b: 130 },

  // Modern "Soft" Tones
  sand:          { r: 244, g: 236, b: 219 },
  beige:         { r: 245, g: 245, b: 220 },
  ivory:         { r: 255, g: 255, b: 240 },
  blush:         { r: 222, g: 93, b: 131 },
  sage:          { r: 188, g: 184, b: 138 },
  dustyBlue:     { r: 96, g: 147, b: 172 },
  terracotta:    { r: 204, g: 78, b: 92 }
};

// =============================================================================
// ICON PROVIDERS
// =============================================================================

const ICON_PROVIDERS = {
  // FontAwesome
  'fontawesome-solid': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/solid/{icon}.svg',
  'fontawesome-regular': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/regular/{icon}.svg',
  'fontawesome-brands': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/brands/{icon}.svg',
  
  // Bootstrap Icons
  'bootstrap': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/icons/{icon}.svg',
  
  // Heroicons
  'heroicons-outline': 'https://unpkg.com/heroicons@2.0.18/24/outline/{icon}.svg',
  'heroicons-solid': 'https://unpkg.com/heroicons@2.0.18/24/solid/{icon}.svg',
  
  // Lucide Icons
  'lucide': 'https://unpkg.com/lucide-static@latest/icons/{icon}.svg',
  
  // Tabler Icons
  'tabler': 'https://unpkg.com/@tabler/icons@latest/icons/{icon}.svg',
  
  // Simple Icons (brands)
  'simple-icons': 'https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/{icon}.svg'
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
        normalizedColor.startsWith('url(') ||
        normalizedColor.includes('gradient')) {
      return match;
    }
    return `style="${before}fill: ${finalColor}${after}"`;
  });

  // Add default fill to path elements that don't have fill
  enhanced = enhanced.replace(/(<path[^>]*?)(>)/gi, (match, tag, close) => {
    if (!tag.includes('fill=')) {
      return tag + ` fill="${finalColor}"` + close;
    }
    return match;
  });

  // Add default fill to other common SVG elements
  ['circle', 'rect', 'ellipse', 'polygon', 'polyline'].forEach(element => {
    enhanced = enhanced.replace(new RegExp(`(<${element}[^>]*?)(>)`, 'gi'), (match, tag, close) => {
      if (!tag.includes('fill=')) {
        return tag + ` fill="${finalColor}"` + close;
      }
      return match;
    });
  });

  // Replace stroke in style attributes
  enhanced = enhanced.replace(/style="([^"]*?)stroke:\s*([^;"]+)([^"]*?)"/gi, (match, before, color, after) => {
    const normalizedColor = color.trim().toLowerCase();
    if (normalizedColor === 'none' ||
        normalizedColor === 'transparent' ||
        normalizedColor.startsWith('url(') ||
        normalizedColor.includes('gradient')) {
      return match;
    }
    return `style="${before}stroke: ${finalColor}${after}"`;
  });

  return enhanced;
}

// =============================================================================
// ICON PROCESSING
// =============================================================================

function resolveIconUrl(iconParam) {
  if (!iconParam) return null;
  
  // Check if it's a provider:icon format
  const colonIndex = iconParam.indexOf(':');
  if (colonIndex > 0) {
    const provider = iconParam.substring(0, colonIndex);
    const iconName = iconParam.substring(colonIndex + 1);
    
    const template = ICON_PROVIDERS[provider];
    if (template) {
      return template.replace('{icon}', iconName);
    }
  }
  
  // Otherwise, treat as direct URL
  return iconParam;
}

async function processIcon(iconParam, iconColor) {
  const url = resolveIconUrl(iconParam);
  if (!url) return null;

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

    // Ensure positive dimensions
    if (originalWidth <= 0) originalWidth = 24;
    if (originalHeight <= 0) originalHeight = 24;

    // Calculate final dimensions (maintain aspect ratio but target reasonable size for badge fit)
    const aspectRatio = originalWidth / originalHeight;
    let targetHeight = 16;
    let targetWidth;

    if (isNaN(aspectRatio) || !isFinite(aspectRatio)) {
      targetWidth = 16;
    } else {
      targetWidth = Math.round(targetHeight * aspectRatio);
      // For brand logos like Simple Icons, allow reasonable width but cap at badge-friendly size
      const maxWidth = 40; // Allow wider logos to show properly
      if (targetWidth > maxWidth) {
        targetWidth = maxWidth;
        targetHeight = Math.round(maxWidth / aspectRatio);
        // Ensure minimum height for visibility
        if (targetHeight < 12) {
          targetHeight = 12;
          targetWidth = Math.round(targetHeight * aspectRatio);
        }
      }
    }

    // Apply color processing if needed - but preserve SVG nature
    if (iconColor) {
      cleanSvg = enhanceColorProcessing(cleanSvg, iconColor);
    }

    // Remove any existing xmlns declarations to avoid conflicts
    cleanSvg = cleanSvg.replace(/\s*xmlns[^=]*="[^"]*"/g, '');

    // Create ultra-high-quality SVG - preserve original aspect ratio
    let enhancedSvg = cleanSvg
      .replace(/<svg[^>]*>/i, (match) => {
        // Extract existing attributes
        let attrs = match.replace(/<svg\s*/i, '').replace(/>\s*$/, '');

        // Remove existing width, height, viewBox to replace them
        attrs = attrs.replace(/\s*(width|height|viewBox)="[^"]*"/gi, '');

        // Add quality rendering attributes and dimensions
        const qualityAttrs = [
          'shape-rendering="geometricPrecision"',
          'text-rendering="optimizeLegibility"',
          'image-rendering="optimizeQuality"',
          'color-rendering="optimizeQuality"',
          `width="${targetWidth}"`,
          `height="${targetHeight}"`,
          `viewBox="${viewBoxX} ${viewBoxY} ${originalWidth} ${originalHeight}"`,
          'xmlns="http://www.w3.org/2000/svg"'
        ].join(' ');

        return `<svg ${attrs} ${qualityAttrs}>`;
      });

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(enhancedSvg).toString('base64')}`;

    console.log('Pure SVG processed (vector quality):', `${targetWidth}x${targetHeight}`, 'from', `${originalWidth}x${originalHeight}`);
    return { dataUri, width: targetWidth, height: targetHeight };
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

    // Calculate final display size (set to 16px height for badge fit, but allow some flexibility)
    const displayHeight = Math.min(iconData.height, 20); // Allow up to 20px height for better visibility
    const displayWidth = Math.round(displayHeight * aspectRatio);
    
    // Cap width to prevent overflow but allow reasonable width for logos
    const maxDisplayWidth = 28;
    let finalWidth = displayWidth;
    let finalHeight = displayHeight;
    
    if (displayWidth > maxDisplayWidth) {
      finalWidth = maxDisplayWidth;
      finalHeight = Math.round(maxDisplayWidth / aspectRatio);
      // Ensure minimum height
      if (finalHeight < 10) {
        finalHeight = 10;
        finalWidth = Math.round(finalHeight * aspectRatio);
      }
    }

    const base64 = processedBuffer.toString('base64');

    // Create SVG with ultra-high quality settings and proper scaling
    let svg = `<svg width="${finalWidth}" height="${finalHeight}" viewBox="0 0 ${finalWidth} ${finalHeight}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" image-rendering="optimizeQuality" color-rendering="optimizeQuality">
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
      <image href="data:image/png;base64,${base64}" width="${finalWidth}" height="${finalHeight}" filter="url(#icon-enhance)" style="image-rendering: -webkit-optimize-contrast; image-rendering: optimizeQuality;"/>
    </svg>`;

    // Apply color processing to the final SVG if iconColor is specified
    if (iconColor) {
      svg = enhanceColorProcessing(svg, iconColor);
    }

    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    console.log('Ultra-high-quality raster processing:', finalWidth, 'x', finalHeight, 'from working size', workingWidth, 'x', workingHeight);
    return { dataUri, width: finalWidth, height: finalHeight };
  } catch (error) {
    console.error('High-quality raster processing failed:', error.message);
    return null;
  }
}

// =============================================================================
// BADGE GENERATION
// =============================================================================

function calculateBadgeDimensions(text, iconData) {
  // Fixed padding values that don't change based on text length
  const padding = 12; // Consistent padding on left and right
  const iconPadding = iconData ? 8 : 0; // Space between icon and text
  
  let iconWidth = 0, iconHeight = 0;
  if (iconData) {
    // Use the processed dimensions, but constrain to fit nicely in badge
    iconWidth = Math.min(iconData.width, 32); // Max 32px width to prevent overflow
    iconHeight = Math.min(iconData.height, 20); // Max 20px height to fit in 32px badge
    
    // Maintain aspect ratio when constraining
    const originalAspectRatio = iconData.width / iconData.height;
    if (iconWidth < iconData.width) {
      // Width was constrained, adjust height
      iconHeight = Math.round(iconWidth / originalAspectRatio);
    } else if (iconHeight < iconData.height) {
      // Height was constrained, adjust width
      iconWidth = Math.round(iconHeight * originalAspectRatio);
    }
    
    // Ensure minimum size for visibility
    if (iconHeight < 12) {
      iconHeight = 12;
      iconWidth = Math.round(iconHeight * originalAspectRatio);
    }
  }

  const height = 32;
  
  // We'll let CSS handle the width - just calculate positions
  return {
    height,
    iconWidth,
    iconHeight,
    padding,
    iconPadding,
    iconX: padding,
    iconY: Math.round((height - iconHeight) / 2 ),
    textX: padding + iconWidth + iconPadding, // Start position for text
    textY: Math.round(height / 2 + 4)
  };
}

function calculateTextWidth(text, fontSize = 12, fontFamily = 'Verdana') {
  // More accurate text width calculation using character-specific widths for Verdana 12px font-weight 600
  const charWidths = {
    // Narrow characters
    'i': 4, 'l': 4, 'j': 4.5, 't': 5, 'f': 5.5, 'r': 6,
    // Medium characters
    'a': 7, 'c': 7, 'e': 7, 'n': 7.5, 'o': 7.5, 's': 7, 'u': 7.5, 'v': 7, 'x': 7, 'z': 7,
    'b': 7.5, 'd': 7.5, 'g': 7.5, 'h': 7.5, 'k': 7.5, 'p': 7.5, 'q': 7.5, 'y': 7,
    // Wide characters
    'm': 11, 'w': 11,
    // Numbers (generally consistent width)
    '0': 7.5, '1': 5, '2': 7.5, '3': 7.5, '4': 7.5, '5': 7.5, '6': 7.5, '7': 7.5, '8': 7.5, '9': 7.5,
    // Special characters
    ' ': 4, '.': 4, ',': 4, ':': 4, ';': 4, '!': 4.5, '?': 7.5, '-': 5, '_': 7.5,
    '(': 5, ')': 5, '[': 5, ']': 5, '{': 5.5, '}': 5.5, '/': 5.5, '\\': 5.5, '|': 4,
    '+': 8, '=': 8, '<': 8, '>': 8, '@': 12, '#': 8.5, '$': 7.5, '%': 12, '^': 7,
    '&': 9.5, '*': 6, '~': 8, '`': 5, "'": 4, '"': 6
  };

  let totalWidth = 0;
  for (let char of text) {
    const lowerChar = char.toLowerCase();
    if (charWidths[lowerChar]) {
      // For uppercase letters, add 10% more width
      const baseWidth = charWidths[lowerChar];
      totalWidth += char === char.toUpperCase() && char !== char.toLowerCase() ? baseWidth * 1.1 : baseWidth;
    } else {
      // Default width for unknown characters (more generous)
      totalWidth += 8;
    }
  }

  // Add letter spacing (0.1em = 0.1 * fontSize)
  totalWidth += (text.length - 1) * (fontSize * 0.1);

  // Add a safety margin to prevent clipping (20% buffer for better accuracy)
  totalWidth *= 1.2;

  return Math.ceil(totalWidth);
}

function generateBadgeSvg(text, bgColor, iconData, textColor, edges = 'rounded') {
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
    finalTextColor = 'rgb(255, 255, 255)'; // Default to white text
  }

  const dims = calculateBadgeDimensions(text, iconData);
  const fontSize = 11;
  const fontFamily = 'Verdana, system-ui, sans-serif';

  // Calculate exact text width server-side for GitHub compatibility
  const textWidth = calculateTextWidth(text, fontSize);

  // Calculate total width with consistent padding
  const totalWidth = dims.padding + dims.iconWidth + dims.iconPadding + textWidth + dims.padding;

  // Determine corner radius based on edges parameter
  let cornerRadius = '';
  switch (edges.toLowerCase()) {
    case 'rounded':
    case 'round':
      cornerRadius = 'rx="8" ry="8"';
      break;
    case 'square':
    case 'squared':
      cornerRadius = 'rx="0" ry="0"';
      break;
    case 'sharp':
      cornerRadius = 'rx="0" ry="0"';
      break;
    case 'pill':
      cornerRadius = `rx="${dims.height / 2}" ry="${dims.height / 2}"`;
      break;
    default:
      cornerRadius = 'rx="8" ry="8"'; // default to rounded
  }

  // Generate SVG with exact dimensions (no JavaScript needed)
  const iconSection = iconData ? `<image href="${iconData.dataUri}" x="${dims.iconX}" y="${dims.iconY}" width="${dims.iconWidth}" height="${dims.iconHeight}" style="image-rendering: optimizeQuality;"/>` : '';

  return `<svg width="${totalWidth}" height="${dims.height}" viewBox="0 0 ${totalWidth} ${dims.height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="optimizeLegibility" image-rendering="optimizeQuality" color-rendering="optimizeQuality">
    <rect width="${totalWidth}" height="${dims.height}" fill="${bgColor}" ${cornerRadius}/>
    ${iconSection}
    <text x="${dims.padding + dims.iconWidth + dims.iconPadding}" y="${dims.height / 2}" text-anchor="start" dominant-baseline="middle" fill="${finalTextColor}" font-size="${fontSize}" font-weight="600" font-family="${fontFamily}" style="text-rendering: optimizeLegibility; letter-spacing: 0.1em;">${text}</text>
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
    textColor,
    edges = 'rounded'
  } = req.query;

  // Parse bgColor to handle both hex and named colors
  const parsedBgColor = parseColor(bgColor);
  // Make the background color lighter and more subtle
  const lighterR = Math.min(255, Math.round(parsedBgColor.r * 1.15 + 20));
  const lighterG = Math.min(255, Math.round(parsedBgColor.g * 1.15 + 20));
  const lighterB = Math.min(255, Math.round(parsedBgColor.b * 1.15 + 20));
  const finalBgColor = `rgb(${lighterR}, ${lighterG}, ${lighterB})`;

  // Process icon if provided
  let iconData = null;
  if (icon) {
    // Default icon color to white if not specified
    const finalIconColor = iconColor || 'white';
    iconData = await processIcon(icon, finalIconColor);
  }

  // Generate SVG badge
  const svg = generateBadgeSvg(text, finalBgColor, iconData, textColor, edges);

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