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
const axios = require('axios');
const sharp = require('sharp');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const potrace = require('potrace');

const app = express();
const port = process.env.PORT || 3000;

/**
 * Standard color palette for badges. Keeps things consistent and avoids
 * user typos with hex codes. RGB values ensure cross-browser reliability.
 */
const COLORS = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  grayLight: { r: 245, g: 245, b: 247 },
  gray: { r: 128, g: 128, b: 128 },
  grayDark: { r: 64, g: 64, b: 64 },
  slate: { r: 112, g: 128, b: 144 },
  charcoal: { r: 54, g: 69, b: 79 },
  blue: { r: 0, g: 122, b: 255 },
  lightBlue: { r: 173, g: 216, b: 230 },
  skyBlue: { r: 135, g: 206, b: 235 },
  teal: { r: 0, g: 150, b: 136 },
  cyan: { r: 0, g: 188, b: 212 },
  green: { r: 76, g: 175, b: 80 },
  mint: { r: 152, g: 251, b: 152 },
  seafoam: { r: 120, g: 219, b: 226 },
  olive: { r: 128, g: 128, b: 0 },
  emerald: { r: 80, g: 200, b: 120 },
  yellow: { r: 255, g: 235, b: 59 },
  amber: { r: 255, g: 191, b: 0 },
  orange: { r: 255, g: 152, b: 0 },
  peach: { r: 255, g: 218, b: 185 },
  gold: { r: 255, g: 215, b: 0 },
  red: { r: 244, g: 67, b: 54 },
  coral: { r: 255, g: 127, b: 80 },
  salmon: { r: 250, g: 128, b: 114 },
  pink: { r: 255, g: 192, b: 203 },
  rose: { r: 255, g: 102, b: 102 },
  purple: { r: 156, g: 39, b: 176 },
  lavender: { r: 230, g: 230, b: 250 },
  lilac: { r: 200, g: 162, b: 200 },
  violet: { r: 148, g: 0, b: 211 },
  indigo: { r: 75, g: 0, b: 130 },
  sand: { r: 244, g: 236, b: 219 },
  beige: { r: 245, g: 245, b: 220 },
  ivory: { r: 255, g: 255, b: 240 },
  blush: { r: 222, g: 93, b: 131 },
  sage: { r: 188, g: 184, b: 138 },
  dustyBlue: { r: 96, g: 147, b: 172 },
  terracotta: { r: 204, g: 78, b: 92 }
};

/**
 * Icon sources from popular libraries. Uses CDNs for easy updates,
 * but cache locally in production. {icon} gets replaced with the icon name.
 */
const ICON_PROVIDERS = {
  'fontawesome-solid': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/solid/{icon}.svg',
  'fontawesome-regular': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/regular/{icon}.svg',
  'fontawesome-brands': 'https://unpkg.com/@fortawesome/fontawesome-free@6.5.1/svgs/brands/{icon}.svg',
  'bootstrap': 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/icons/{icon}.svg',
  'heroicons-outline': 'https://unpkg.com/heroicons@2.0.18/24/outline/{icon}.svg',
  'heroicons-solid': 'https://unpkg.com/heroicons@2.0.18/24/solid/{icon}.svg',
  'lucide': 'https://unpkg.com/lucide-static@latest/icons/{icon}.svg',
  'tabler': 'https://unpkg.com/@tabler/icons@latest/icons/{icon}.svg',
  'simple-icons': 'https://cdn.jsdelivr.net/npm/simple-icons@v10/icons/{icon}.svg'
};

/**
 * Turns color strings into RGB. Handles hex like "FF0000" or names like "red".
 * Falls back to white if input is garbage - better than breaking the badge.
 * @param {string} color - Color name or hex
 * @returns {Object} RGB object
 */
function parseColor(color) {
  if (typeof color !== 'string') {
    return COLORS.white;
  }

  if (/^[0-9A-Fa-f]{6}$/.test(color)) {
    return {
      r: parseInt(color.substr(0, 2), 16),
      g: parseInt(color.substr(2, 2), 16),
      b: parseInt(color.substr(4, 2), 16)
    };
  } else {
    return COLORS[color.toLowerCase()] || COLORS.white;
  }
}

/**
 * Recolors SVG elements. Handles fills, strokes, styles, and even embedded images.
 * Skips gradients and transparency to avoid messing up the design.
 * @param {string} svgString - The SVG markup
 * @param {string} targetColor - New color
 * @returns {string} Recolored SVG
 */
function changeSvgColor(svgString, targetColor) {
  const rgb = parseColor(targetColor);
  const finalColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  let enhanced = svgString;

  // Handle SVGs with raster images - use filters to colorize without losing detail
  if (enhanced.includes('<image')) {
    // Custom filter for subtle colorization of images
    // Matrix applies target RGB while keeping image structure intact
    const subtleFilter = `
        <filter id="subtle-colorize">
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.0" intercept="0"/>
            <feFuncG type="linear" slope="1.0" intercept="0"/>
            <feFuncB type="linear" slope="1.0" intercept="0"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="1.0"/>
          <feColorMatrix type="matrix" values="0 0 0 0 ${rgb.r/255}
                                               0 0 0 0 ${rgb.g/255}
                                               0 0 0 0 ${rgb.b/255}
                                               0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent="1.0"/>
            <feFuncG type="gamma" amplitude="1" exponent="1.0"/>
            <feFuncB type="gamma" amplitude="1" exponent="1.0"/>
          </feComponentTransfer>
          <feColorMatrix type="saturate" values="1.0"/>
        </filter>`;

    enhanced = enhanced.replace('<defs>', `<defs>${subtleFilter}`);
    enhanced = enhanced.replace(/<image([^>]*?)\/>/g, (match, attrs) => {
      if (attrs.includes('filter=')) {
        return match.replace(/filter="[^"]*"/, `filter="url(#subtle-colorize)"`);
      } else {
        return `<image${attrs} filter="url(#subtle-colorize)"/>`;
      }
    });

    return enhanced;
  }

  enhanced = enhanced.replace(/fill=(["'])([^"']*)\1/gi, (match, quote, value) => {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'none' ||
        normalizedValue === 'transparent' ||
        normalizedValue.startsWith('url(') ||
        normalizedValue.includes('gradient')) {
      return match;
    }
    return `fill=${quote}${finalColor}${quote}`;
  });

  enhanced = enhanced.replace(/stroke=(["'])([^"']*)\1/gi, (match, quote, value) => {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'none' ||
        normalizedValue === 'transparent' ||
        normalizedValue.startsWith('url(') ||
        normalizedValue.includes('gradient')) {
      return match;
    }
    return `stroke=${quote}${finalColor}${quote}`;
  });

  enhanced = enhanced.replace(/<style[^>]*>(.*?)<\/style>/gi, (match, content) => {
    let newContent = content;
    newContent = newContent.replace(/fill:\s*([^;}]+)/gi, `fill: ${finalColor}`);
    newContent = newContent.replace(/stroke:\s*([^;}]+)/gi, `stroke: ${finalColor}`);
    newContent = newContent.replace(/color:\s*([^;}]+)/gi, `color: ${finalColor}`);
    newContent = newContent.replace(/stop-color:\s*([^;}]+)/gi, `stop-color: ${finalColor}`);
    return match.replace(content, newContent);
  });

  enhanced = enhanced.replace(/style=(["'])([^"']*)\1/gi, (match, quote, content) => {
    let newContent = content;
    newContent = newContent.replace(/fill:\s*([^;]+)/gi, (m, color) => {
      const normalizedColor = color.trim().toLowerCase();
      if (normalizedColor === 'none' ||
          normalizedColor === 'transparent' ||
          normalizedColor.startsWith('url(') ||
          normalizedColor.includes('gradient')) {
        return m;
      }
      return `fill: ${finalColor}`;
    });
    newContent = newContent.replace(/stroke:\s*([^;]+)/gi, (m, color) => {
      const normalizedColor = color.trim().toLowerCase();
      if (normalizedColor === 'none' ||
          normalizedColor === 'transparent' ||
          normalizedColor.startsWith('url(') ||
          normalizedColor.includes('gradient')) {
        return m;
      }
      return `stroke: ${finalColor}`;
    });
    return `style=${quote}${newContent}${quote}`;
  });

  enhanced = enhanced.replace(/(<path[^>]*?)(>)/gi, (match, tag, close) => {
    if (!tag.includes('fill=')) {
      return tag + ` fill="${finalColor}"` + close;
    }
    return match;
  });

  ['circle', 'rect', 'ellipse', 'polygon', 'polyline'].forEach(element => {
    enhanced = enhanced.replace(new RegExp(`(<${element}[^>]*?)(>)`, 'gi'), (match, tag, close) => {
      if (!tag.includes('fill=')) {
        return tag + ` fill="${finalColor}"` + close;
      }
      return match;
    });
  });

  return enhanced;
}

/**
 * Builds icon URLs from provider:name format or returns direct URLs.
 * Easy to extend with new providers.
 * @param {string} iconParam - Icon identifier
 * @returns {string} Full URL
 */
function resolveIconUrl(iconParam) {
  const colonIndex = iconParam.indexOf(':');

  if (colonIndex > 0) {
    const provider = iconParam.substring(0, colonIndex);
    const iconName = iconParam.substring(colonIndex + 1);

    const template = ICON_PROVIDERS[provider];
    if (template) {
      return template.replace('{icon}', iconName);
    }
  }

  return iconParam;
}

/**
 * Fetches and processes an icon into a data URI. Handles SVG and raster images,
 * applies color if needed. Returns null on failure for graceful handling.
 * @param {string} iconParam - Icon source
 * @param {string} iconColor - Optional color
 * @returns {Object|null} Icon data with URI and dimensions
 */
async function generateIcon(iconParam, iconColor) {
  if (!iconParam) return null;
  const url = resolveIconUrl(iconParam);

  const buffer = await fetchImage(url);
  if (!buffer) return null;

  let result;
  if (isSvgBuffer(buffer)) {
    result = await processSvgImage(buffer);
  } else {
    result = await processPixelImage(buffer, iconColor);
  }

  if (!result) return null;

  if (iconColor) {
    result.svgString = changeSvgColor(result.svgString, iconColor);
  }

  const dataUri = `data:image/svg+xml;base64,${Buffer.from(result.svgString).toString('base64')}`;
  return { dataUri, width: result.width, height: result.height };
}

/**
 * Downloads an image with safety checks. Times out to avoid hanging,
 * limits size to prevent abuse, and uses proper headers for compatibility.
 * @param {string} url - Image URL
 * @returns {Buffer|null} Image data or null
 */
async function fetchImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: 5 * 1024 * 1024,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)',
        'Accept': 'image/svg+xml,image/png,image/jpeg,image/gif,image/webp,image/*;q=0.8,*/*;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    const buffer = Buffer.from(response.data);

    return buffer;
  } catch (error) {
    console.error('Failed to fetch image:', error.message);
    return null;
  }
}

/**
 * Checks if buffer is actually an image. Rejects HTML error pages and
 * verifies file signatures for supported formats.
 * @param {Buffer} buffer - Data to check
 * @returns {boolean} True if valid image
 */
function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length === 0) return false;

  const start = buffer.toString('utf8', 0, Math.min(200, buffer.length));

  if (start.includes('<html') || start.includes('<!DOCTYPE') || start.includes('Error') || start.includes('<body')) {
    return false;
  }

  const signatures = {
    png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    jpeg: [0xFF, 0xD8, 0xFF],
    gif87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    gif89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    webp: [0x52, 0x49, 0x46, 0x46],
    svg: start.includes('<svg') || start.includes('<?xml')
  };

  for (const [format, signature] of Object.entries(signatures)) {
    if (format === 'svg') continue;

    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true;
    }
  }

  if (signatures.svg) {
    return true;
  }

  return false;
}

/**
 * Detects SVG content by looking for tags and XML headers.
 * Better than trusting file extensions from URLs.
 * @param {Buffer} buffer - Data to check
 * @returns {boolean} True if SVG
 */
function isSvgBuffer(buffer) {
  if (!buffer || buffer.length === 0) return false;

  const start = buffer.toString('utf8', 0, Math.min(300, buffer.length));
  const normalized = start.toLowerCase().trim();

  return normalized.includes('<svg') ||
         (normalized.includes('<?xml') && (normalized.includes('<svg') || normalized.includes('svg'))) ||
         (normalized.startsWith('<?xml') && normalized.includes('svg'));
}

/**
 * Cleans and resizes SVG icons. Sanitizes to block XSS, extracts dimensions,
 * and scales to fit badge size while keeping aspect ratio.
 * @param {Buffer} buffer - SVG data
 * @returns {Object|null} Processed SVG info
 */
async function processSvgImage(buffer) {
  try {
    const window = new JSDOM('').window;
    // Sanitize to prevent XSS from sketchy icon sources
    let svg = DOMPurify(window).sanitize(buffer.toString('utf8'), {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOW_TAGS: ['svg', 'path', 'circle', 'rect', 'ellipse', 'line', 'polygon', 'polyline', 'g', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'filter', 'feColorMatrix', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode'],
      ALLOW_ATTR: ['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'viewBox', 'transform', 'style', 'id', 'class', 'values', 'type', 'gradientUnits', 'x1', 'y1', 'x2', 'y2', 'offset', 'stdDeviation', 'in', 'result']
    });

    const viewBox = svg.match(/viewBox=["']([^"']+)["']/);
    const width = svg.match(/width=["']([^"']+)["']/);
    const height = svg.match(/height=["']([^"']+)["']/);

    let originalWidth = 24, originalHeight = 24, viewBoxX = 0, viewBoxY = 0;

    if (viewBox) {
      const parts = viewBox[1].split(/\s+/);
      if (parts.length >= 4) {
        viewBoxX = parseFloat(parts[0]) || 0;
        viewBoxY = parseFloat(parts[1]) || 0;
        originalWidth = parseFloat(parts[2]) || 24;
        originalHeight = parseFloat(parts[3]) || 24;
      }
    } else {
      if (width) originalWidth = parseFloat(width[1]) || 24;
      if (height) originalHeight = parseFloat(height[1]) || 24;
    }

    if (originalWidth <= 0) originalWidth = 24;
    if (originalHeight <= 0) originalHeight = 24;

    const aspectRatio = originalWidth / originalHeight;
    const targetHeight = 16;
    let targetWidth;

    if (isNaN(aspectRatio) || !isFinite(aspectRatio)) {
      targetWidth = 16;
    } else {
      targetWidth = Math.round(targetHeight * aspectRatio);
    }

    let enhancedSvg = svg
      .replace(/<svg[^>]*>/i, (match) => {

        match = match.replace(/\s*xmlns[^=]*="[^"]*"/g, '');

        let attrs = match.replace(/<svg\s*/i, '').replace(/>\s*$/, '');

        attrs = attrs.replace(/\s*(width|height|viewBox)="[^"]*"/gi, '');

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

    return { svgString: enhancedSvg, width: targetWidth, height: targetHeight };
  } catch (error) {
    console.error('SVG processing failed:', error.message);
    return null;
  }
}

/**
 * Turns raster images into crisp SVG icons. Uses Sharp for resizing,
 * Potrace for vectorizing when coloring. Adds quality filters.
 * @param {Buffer} buffer - Image data
 * @param {string} iconColor - Color for vectorization
 * @returns {Object|null} Processed icon
 */
async function processPixelImage(buffer, iconColor) {
  try {
    if (!isValidImageBuffer(buffer)) {
      return null;
    }

    const metadata = await sharp(buffer).metadata();

    // Work at high res for quality, but don't go overboard
    const workingSize = 512;
    const aspectRatio = metadata.width / metadata.height;
    let workingWidth = workingSize;
    let workingHeight = workingSize;

    if (aspectRatio > 1) {
      workingHeight = Math.round(workingSize / aspectRatio);
    } else {
      workingWidth = Math.round(workingSize * aspectRatio);
    }

    workingWidth = Math.max(workingWidth, 256);
    workingHeight = Math.max(workingHeight, 256);

    const processedBuffer = await sharp(buffer)
      .resize(workingWidth, workingHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
        fastShrinkOnLoad: false
      })
      .png({
        quality: 100,
        compressionLevel: 0,
        adaptiveFiltering: true,
        palette: false,
        progressive: false
      })
      .toBuffer();

    const displayHeight = 16;
    const displayWidth = Math.round(displayHeight * aspectRatio);

    let finalWidth = displayWidth;
    let finalHeight = displayHeight;

    if (iconColor) {
      const blackPngBuffer = await sharp(processedBuffer)
        .greyscale()
        .threshold(128)
        .png()
        .toBuffer();

      const vectorSvgString = await new Promise((resolve, reject) => {
        potrace.trace(blackPngBuffer, {
          threshold: 128,
          turdSize: 1,
          optTolerance: 0.01,
          alphaMax: 1.0,
          optCurve: false,
          color: 'black',
          background: 'transparent'
        }, (err, svg) => {
          if (err) reject(err);
          else resolve(svg);
        });
      });

      let scaledSvg = vectorSvgString;

      scaledSvg = scaledSvg.replace(
        /<svg([^>]*)width="[^"]*"([^>]*)height="[^"]*"([^>]*)>/,
        `<svg$1width="${finalWidth}"$2height="${finalHeight}"$3>`
      );

      if (!scaledSvg.includes('width=')) {
        scaledSvg = scaledSvg.replace('<svg', `<svg width="${finalWidth}" height="${finalHeight}"`);
      }

      return { svgString: scaledSvg, width: finalWidth, height: finalHeight };
    } else {
      const base64 = processedBuffer.toString('base64');

      let svg = `<svg width="${finalWidth}" height="${finalHeight}" viewBox="0 0 ${finalWidth} ${finalHeight}" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" image-rendering="optimizeQuality" color-rendering="optimizeQuality">
        <defs>
          <filter id="icon-enhance">
            <feColorMatrix type="saturate" values="1.0"/>
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1" exponent="1.0"/>
              <feFuncG type="gamma" amplitude="1" exponent="1.0"/>
              <feFuncB type="gamma" amplitude="1" exponent="1.0"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <image href="data:image/png;base64,${base64}" width="${finalWidth}" height="${finalHeight}" filter="url(#icon-enhance)" style="image-rendering: -webkit-optimize-contrast; image-rendering: optimizeQuality;"/>
      </svg>`;

      console.log('Ultra-high-quality raster processing:', finalWidth, 'x', finalHeight, 'from working size', workingWidth, 'x', workingHeight);
      return { svgString: svg, width: finalWidth, height: finalHeight };
    }
  } catch (error) {
    console.error('High-quality raster processing failed:', error.message);
    return null;
  }
}

/**
 * Figures out spacing and sizing for badge elements. Keeps icons proportional,
 * positions text nicely, handles cases with/without icons.
 * @param {Object} iconData - Icon dimensions or null
 * @returns {Object} Layout calculations
 */
function calculateBadgeDimensions(iconData) {
  const padding = 12;
  const iconPadding = iconData ? 8 : 0;

  let iconWidth = 0, iconHeight = 0;
  if (iconData) {
    iconWidth = Math.min(iconData.width, 32);
    iconHeight = Math.min(iconData.height, 20);

    const originalAspectRatio = iconData.width / iconData.height;
    if (iconWidth < iconData.width) {
      iconHeight = Math.round(iconWidth / originalAspectRatio);
    } else if (iconHeight < iconData.height) {
      iconWidth = Math.round(iconHeight * originalAspectRatio);
    }

    if (iconHeight < 12) {
      iconHeight = 12;
      iconWidth = Math.round(iconHeight * originalAspectRatio);
    }
  }

  const height = 32;

  return {
    height,
    iconWidth,
    iconHeight,
    padding,
    iconPadding,
    iconX: padding,
    iconY: Math.round((height - iconHeight - 2) / 2 ),
    textX: padding + iconWidth + iconPadding,
    textY: Math.round(height / 2 + 4)
  };
}

/**
 * Estimates text width for layout. Uses character widths since measuring
 * fonts in Node is a pain. Good enough for badges.
 * @param {string} text - Text to measure
 * @param {number} fontSize - Font size
 * @returns {number} Approximate width
 */
function calculateTextWidth(text, fontSize) {
  const charWidths = {
    'i': 4, 'l': 4, 'j': 4.5, 't': 5, 'f': 5.5, 'r': 6,
    'a': 7, 'c': 7, 'e': 7, 'n': 7.5, 'o': 7.5, 's': 7, 'u': 7.5, 'v': 7, 'x': 7, 'z': 7,
    'b': 7.5, 'd': 7.5, 'g': 7.5, 'h': 7.5, 'k': 7.5, 'p': 7.5, 'q': 7.5, 'y': 7,
    'm': 11, 'w': 11,
    '0': 7.5, '1': 5, '2': 7.5, '3': 7.5, '4': 7.5, '5': 7.5, '6': 7.5, '7': 7.5, '8': 7.5, '9': 7.5,
    ' ': 4, '.': 4, ',': 4, ':': 4, ';': 4, '!': 4.5, '?': 7.5, '-': 5, '_': 7.5,
    '(': 5, ')': 5, '[': 5, ']': 5, '{': 5.5, '}': 5.5, '/': 5.5, '\\': 5.5, '|': 4,
    '+': 8, '=': 8, '<': 8, '>': 8, '@': 12, '#': 8.5, '$': 7.5, '%': 12, '^': 7,
    '&': 9.5, '*': 6, '~': 8, '`': 5, "'": 4, '"': 6
  };

  let totalWidth = 0;
  for (let char of text) {
    const lowerChar = char.toLowerCase();
    if (charWidths[lowerChar]) {
      const baseWidth = charWidths[lowerChar];
      totalWidth += char === char.toUpperCase() && char !== char.toLowerCase() ? baseWidth * 1.1 : baseWidth;
    } else {
      totalWidth += 8;
    }
  }

  totalWidth += (text.length - 1) * (fontSize * 0.1);
  totalWidth *= 1.2;

  return Math.ceil(totalWidth);
}

/**
 * Builds the final SVG badge. Parses colors, calculates layout,
 * handles different edge styles (rounded, square, pill).
 * @param {string} text - Badge text
 * @param {string} bgColor - Background color
 * @param {Object} iconData - Processed icon
 * @param {string} textColor - Text color
 * @param {string} edges - Corner style
 * @returns {string} Complete SVG
 */
function generateBadgeSvg(text, bgColor, iconData, textColor, edges) {
  let finalTextColor;

  const bgParsed = parseColor(bgColor);
  const bgColorFormatted = `rgb(${bgParsed.r}, ${bgParsed.g}, ${bgParsed.b})`;

  const parsedColor = parseColor(textColor);
  finalTextColor = `rgb(${parsedColor.r}, ${parsedColor.g}, ${parsedColor.b})`;

  const dims = calculateBadgeDimensions(iconData);
  const fontSize = 11;
  const fontFamily = 'Verdana, system-ui, sans-serif';

  let textWidth = 0;
  if (text){
    textWidth = calculateTextWidth(text, fontSize) + dims.iconPadding ;
  }

  const totalWidth = dims.padding + dims.iconWidth + dims.padding + textWidth;

  let cornerRadius = '';
  switch (edges.toLowerCase()) {
    case 'rounded':
    case 'round':
      cornerRadius = 'rx="8" ry="8"';
      break;
    case 'square':
    case 'sharp':
    case 'squared':
      cornerRadius = 'rx="0" ry="0"';
      break;
    case 'pill':
      cornerRadius = `rx="${dims.height / 2}" ry="${dims.height / 2}"`;
      break;
  }

  const iconSection = iconData ? `
  <image
    href="${iconData.dataUri}"
    x="${dims.iconX}"
    y="${dims.iconY}"
    width="${dims.iconWidth}"
    height="${dims.iconHeight}"
    style="image-rendering: optimizeQuality;"/>
    `: '';

  return `
    <svg
      fill="white"
      width="${totalWidth}"
      height="${dims.height}"
      viewBox="0 0 ${totalWidth} ${dims.height}"
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="geometricPrecision"
      text-rendering="optimizeLegibility"
      image-rendering="optimizeQuality"
      color-rendering="optimizeQuality">
    <rect
      width="${totalWidth}"
      height="${dims.height}"
      fill="${bgColorFormatted}"
      ${cornerRadius}/>
    ${iconSection}

    ${text !== null && text !== undefined ? `<text
      x="${dims.padding + dims.iconWidth + dims.iconPadding}"
      y="${dims.height / 2}"
      text-anchor="start"
      dominant-baseline="middle"
      fill="${finalTextColor}"
      font-size="${fontSize}"
      font-weight="600"
      font-family="${fontFamily}"
      style="text-rendering: optimizeLegibility;
      letter-spacing: 0.2em;">${text}</text>` : ''}
  </svg>`;
}

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
    edges = 'squared'
  } = req.query;

  const iconData = await generateIcon(icon, iconColor);
  const svg = generateBadgeSvg(text, bgColor, iconData, textColor, edges);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
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
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});