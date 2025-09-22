const axios = require('axios');
const sharp = require('sharp');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const potrace = require('potrace');
const { ICON_PROVIDERS } = require('./constants');
const { changeSvgColor } = require('./colorUtils');

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

module.exports = { generateIcon };