const express = require('express');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const sharp = require('sharp');
const { LRUCache } = require('lru-cache');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const app = express();
const port = process.env.PORT || 3000;

const cache = new LRUCache({
  max: 100, // Maximum number of items
  ttl: 1000 * 60 * 60 // 1 hour TTL
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Color contrast utilities
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function colorNameToRgb(colorName) {
  const colorMap = {
    'black': { r: 0, g: 0, b: 0 },
    'white': { r: 255, g: 255, b: 255 },
    'red': { r: 255, g: 0, b: 0 },
    'green': { r: 0, g: 128, b: 0 },
    'blue': { r: 0, g: 0, b: 255 },
    'yellow': { r: 255, g: 255, b: 0 },
    'purple': { r: 128, g: 0, b: 128 },
    'orange': { r: 255, g: 165, b: 0 },
    'pink': { r: 255, g: 192, b: 203 },
    'gray': { r: 128, g: 128, b: 128 },
    'grey': { r: 128, g: 128, b: 128 },
    'silver': { r: 192, g: 192, b: 192 },
    'maroon': { r: 128, g: 0, b: 0 },
    'olive': { r: 128, g: 128, b: 0 },
    'lime': { r: 0, g: 255, b: 0 },
    'aqua': { r: 0, g: 255, b: 255 },
    'teal': { r: 0, g: 128, b: 128 },
    'navy': { r: 0, g: 0, b: 128 },
    'fuchsia': { r: 255, g: 0, b: 255 }
  };
  return colorMap[colorName.toLowerCase()] || null;
}

function parseColorToRgb(color) {
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }
  return colorNameToRgb(color);
}

function getRelativeLuminance(r, g, b) {
  const normalize = (val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

function getContrastRatio(color1, color2) {
  const rgb1 = parseColorToRgb(color1);
  const rgb2 = parseColorToRgb(color2);

  if (!rgb1 || !rgb2) return 1; // fallback

  const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

function getOptimalTextColor(bgColor, currentTextColor = 'white') {
  // If current text color already has good contrast, keep it
  const currentContrast = getContrastRatio(bgColor, currentTextColor);
  if (currentContrast >= 4.5) {
    return currentTextColor;
  }

  // Otherwise, choose between white and black
  const whiteContrast = getContrastRatio(bgColor, 'white');
  const blackContrast = getContrastRatio(bgColor, 'black');

  return whiteContrast > blackContrast ? 'white' : 'black';
}

async function processLogo(url, quality = 'high') {
  const cacheKey = `${url}_${quality}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  
  try {
    // Direct image URL
    const response = await axios.get(url, { 
      responseType: 'arraybuffer', 
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
      }
    });
    const buffer = Buffer.from(response.data);
    
    if (buffer.length > 2 * 1024 * 1024) {
      console.warn('Image too large for URL:', url);
      return null;
    }
    
    // Check if it's SVG by examining the buffer content
    const bufferStart = buffer.toString('utf8', 0, Math.min(200, buffer.length));
    const isSvg = bufferStart.includes('<svg') || bufferStart.includes('<?xml');
    
    if (isSvg) {
      console.log('Processing SVG image from:', url);
      return await processSvgImage(buffer, quality);
    } else {
      console.log('Processing pixel image from:', url);
      return await processPixelImage(buffer, quality);
    }
  } catch (error) {
    console.error('Error processing logo for URL:', url, error.message);
    return null;
  }
}

async function processSvgImage(buffer, quality) {
  try {
    const svgString = buffer.toString('utf8');
    const window = new JSDOM('').window;
    const DOMPurifyInstance = DOMPurify(window);
    
    // Sanitize SVG
    const sanitizedSvg = DOMPurifyInstance.sanitize(svgString, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false
    });

    // Extract dimensions from SVG
    const viewBoxMatch = sanitizedSvg.match(/viewBox=["']([^"']+)["']/);
    const widthMatch = sanitizedSvg.match(/width=["']?([0-9.]+)["']?/);
    const heightMatch = sanitizedSvg.match(/height=["']?([0-9.]+)["']?/);

    let width = 32, height = 32; // default

    if (viewBoxMatch) {
      const viewBox = viewBoxMatch[1].split(/\s+/);
      if (viewBox.length >= 4) {
        width = parseFloat(viewBox[2]) || 32;
        height = parseFloat(viewBox[3]) || 32;
      }
    } else if (widthMatch && heightMatch) {
      width = parseFloat(widthMatch[1]) || 32;
      height = parseFloat(heightMatch[1]) || 32;
    }

    // Ensure high-resolution dimensions with better scaling
    width = Math.max(24, Math.min(width, 512));
    height = Math.max(24, Math.min(height, 512));

    // Quality-based scaling for ultra-crisp rendering
    const scaleFactor = quality === 'ultra' ? 3.0 : quality === 'high' ? 2.5 : 2.0;
    width = Math.round(width * scaleFactor);
    height = Math.round(height * scaleFactor);

    // Enhance the SVG with ultra-high quality rendering attributes
    let enhancedSvg = sanitizedSvg;
    
    // Add or enhance quality attributes
    const qualityAttributes = [
      'shape-rendering="geometricPrecision"',
      'text-rendering="optimizeLegibility"',
      'color-rendering="optimizeQuality"',
      'image-rendering="optimizeQuality"'
    ];
    
    // Remove any existing quality attributes to avoid duplicates
    enhancedSvg = enhancedSvg.replace(/shape-rendering="[^"]*"/g, '');
    enhancedSvg = enhancedSvg.replace(/text-rendering="[^"]*"/g, '');
    enhancedSvg = enhancedSvg.replace(/color-rendering="[^"]*"/g, '');
    enhancedSvg = enhancedSvg.replace(/image-rendering="[^"]*"/g, '');
    
    // Add quality attributes to the root SVG element
    enhancedSvg = enhancedSvg.replace('<svg', `<svg ${qualityAttributes.join(' ')}`);
    
    // Ensure proper viewBox and dimensions
    if (!enhancedSvg.includes('viewBox')) {
      enhancedSvg = enhancedSvg.replace('<svg', `<svg viewBox="0 0 ${width / scaleFactor} ${height / scaleFactor}"`);
    }
    
    // Add quality-enhancing CSS for ultra-crisp rendering
    const qualityCSS = `
      <style>
        * {
          shape-rendering: geometricPrecision;
          text-rendering: optimizeLegibility;
          color-rendering: optimizeQuality;
          image-rendering: optimizeQuality;
        }
        path, circle, ellipse, line, polyline, polygon, rect {
          vector-effect: non-scaling-stroke;
        }
      </style>
    `;
    
    // Insert CSS after opening SVG tag
    enhancedSvg = enhancedSvg.replace('<svg', `<svg`).replace('>', `>${qualityCSS}`);

    const base64 = Buffer.from(enhancedSvg).toString('base64');
    const dataUri = `data:image/svg+xml;base64,${base64}`;
    
    console.log('Successfully processed enhanced SVG:', width, 'x', height, 'quality:', quality);
    return { dataUri, width, height };
  } catch (error) {
    console.error('Error processing SVG:', error.message);
    return null;
  }
}

async function processPixelImage(buffer, quality) {
  try {
    // First check if the buffer contains valid image data
    const bufferStart = buffer.toString('utf8', 0, Math.min(100, buffer.length));
    if (bufferStart.includes('<html') || bufferStart.includes('<!DOCTYPE') || bufferStart.includes('404') || bufferStart.includes('Error')) {
      console.warn('Buffer appears to contain HTML/error page, not image data');
      return null;
    }

    // Try to get metadata - this will fail if format is unsupported
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (metadataError) {
      console.warn('Unsupported image format detected:', metadataError.message);
      
      // Try to detect common unsupported formats and convert them
      const bufferHex = buffer.toString('hex', 0, 12);
      if (bufferHex.startsWith('52494646') && bufferHex.includes('57454250')) {
        console.log('Detected WebP format, attempting conversion...');
        try {
          // Try to process WebP through Sharp anyway
          const convertedBuffer = await sharp(buffer).png().toBuffer();
          metadata = await sharp(convertedBuffer).metadata();
          buffer = convertedBuffer;
        } catch (webpError) {
          console.error('WebP conversion failed:', webpError.message);
          return null;
        }
      } else {
        return null;
      }
    }
    
    console.log('Processing pixel image:', metadata.format, metadata.width + 'x' + metadata.height);
    
    // Calculate target dimensions with much higher quality settings
    const baseHeight = quality === 'ultra' ? 96 : quality === 'high' ? 80 : 64;
    const aspectRatio = metadata.width / metadata.height;
    let targetWidth = Math.round(baseHeight * aspectRatio);
    let targetHeight = baseHeight;
    
    // Allow much larger dimensions for ultra-crisp rendering
    const maxWidth = quality === 'ultra' ? 512 : quality === 'high' ? 384 : 256;
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(targetWidth / aspectRatio);
    }

    // Ultra-high quality processing with advanced techniques
    let processedBuffer;
    
    // Determine if we need supersampling based on source image size
    const needsSupersampling = metadata.width < targetWidth * 1.5 || metadata.height < targetHeight * 1.5;
    
    if (needsSupersampling && quality !== 'standard') {
      // Multi-stage supersampling for crisp results
      console.log('Applying supersampling for enhanced quality...');
      
      const supersampleFactor = quality === 'ultra' ? 3 : 2.5;
      const supersampleWidth = Math.round(targetWidth * supersampleFactor);
      const supersampleHeight = Math.round(targetHeight * supersampleFactor);
      
      // Stage 1: Intelligent upscaling with edge enhancement
      const stage1Buffer = await sharp(buffer)
        .resize(supersampleWidth, supersampleHeight, {
          fit: 'inside',
          withoutEnlargement: false,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        })
        .linear(1.05, -2) // Slight gamma adjustment for clarity
        .modulate({ 
          brightness: 1.02, 
          saturation: 1.08,  // Enhanced saturation for vibrant colors
          hue: 0 
        })
        .sharpen({ 
          sigma: 0.5, 
          m1: 1.2,   // Edge enhancement
          m2: 2.5,   // Strong edge detection
          x1: 2,     // Threshold
          y2: 10,    // Maximum gain
          y3: 20     // Maximum gain at high amplitude
        })
        .png({
          quality: 100,
          compressionLevel: 0,
          progressive: false,
          adaptiveFiltering: false,
          palette: false,
          colours: 256,
          dither: 0.0
        })
        .toBuffer();
      
      // Stage 2: High-quality downsampling with anti-aliasing
      processedBuffer = await sharp(stage1Buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        })
        .sharpen({ 
          sigma: 0.3, 
          m1: 1.0, 
          m2: 1.5,
          x1: 2,
          y2: 8,
          y3: 15
        })
        .modulate({ 
          brightness: 1.01, 
          saturation: 1.03  // Final color enhancement
        })
        .png({
          quality: 100,
          compressionLevel: 0,
          progressive: false,
          adaptiveFiltering: false,
          palette: false,
          colours: 256,
          dither: 0.0
        })
        .toBuffer();
    } else {
      // Direct high-quality processing for already high-res images
      console.log('Applying direct high-quality processing...');
      
      processedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        })
        .linear(1.03, -1.5) // Contrast enhancement
        .modulate({ 
          brightness: 1.02, 
          saturation: 1.06,
          hue: 0 
        })
        .sharpen({ 
          sigma: quality === 'ultra' ? 0.6 : 0.4, 
          m1: 1.0, 
          m2: quality === 'ultra' ? 2.2 : 1.8,
          x1: 2,
          y2: quality === 'ultra' ? 10 : 8,
          y3: quality === 'ultra' ? 18 : 15
        })
        .png({
          quality: 100,
          compressionLevel: 0,
          progressive: false,
          adaptiveFiltering: false,
          palette: false,
          colours: 256,
          dither: 0.0
        })
        .toBuffer();
    }

    // Convert to base64 and create ultra-high-quality SVG wrapper
    const base64 = processedBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    // Enhanced SVG with optimal rendering hints
    const svg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" xmlns="http://www.w3.org/2000/svg" style="shape-rendering: geometricPrecision; image-rendering: -webkit-optimize-contrast; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;">
      <defs>
        <filter id="enhance" x="0%" y="0%" width="100%" height="100%">
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 .5 1"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image href="${dataUri}" width="${targetWidth}" height="${targetHeight}" x="0" y="0" style="image-rendering: -webkit-optimize-contrast; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated; filter: url(#enhance);"/>
    </svg>`;

    const svgBase64 = Buffer.from(svg).toString('base64');
    const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;

    console.log('Successfully processed pixel image to enhanced SVG:', targetWidth, 'x', targetHeight);
    return { dataUri: svgDataUri, width: targetWidth, height: targetHeight };
  } catch (error) {
    console.error('Error processing pixel image:', error.message);
    return null;
  }
}

// Badge generation endpoint
app.get('/badge', async (req, res) => {
  const { text = 'Badge', color = 'blue', logo, textColor = 'white', fontFamily = 'Verdana, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif', autoContrast = 'true', logoQuality = 'high' } = req.query;
  let logoData = null;
  
  // Process direct logo URL if provided
  if (logo) {
    console.log('Processing direct logo URL:', logo);
    logoData = await processLogo(logo, logoQuality);
    if (logoData) {
      cache.set(`${logo}_${logoQuality}`, logoData);
    }
  }

  // Auto-adjust text color for better contrast if enabled
  let finalTextColor = textColor;
  if (autoContrast === 'true') {
    finalTextColor = getOptimalTextColor(color, textColor);
  }

  const logoWidth = logoData ? logoData.width : 0;
  const logoHeight = logoData ? logoData.height : 24;
  
  // Scale down large logos for badge display while maintaining ultra-high quality
  let displayLogoWidth = logoWidth;
  let displayLogoHeight = logoHeight;
  const maxDisplayHeight = logoQuality === 'ultra' ? 40 : logoQuality === 'high' ? 36 : 32;
  
  if (logoHeight > maxDisplayHeight) {
    const scale = maxDisplayHeight / logoHeight;
    displayLogoWidth = Math.round(logoWidth * scale);
    displayLogoHeight = maxDisplayHeight;
  }
  
  // Enhanced text width calculation for better spacing
  const avgCharWidth = fontFamily.includes('monospace') ? 8.5 : 7.8;
  const textWidth = Math.ceil(text.length * avgCharWidth);
  
  const padding = logoQuality === 'ultra' ? 18 : 16;
  const logoPadding = logoData ? (logoQuality === 'ultra' ? 10 : 8) : 0;
  const height = Math.max(logoQuality === 'ultra' ? 44 : 40, displayLogoHeight + 8);
  const totalWidth = padding + displayLogoWidth + logoPadding + textWidth + padding;
  
  // Ultra-precise positioning for pixel-perfect alignment
  const logoX = padding;
  const logoY = Math.round((height - displayLogoHeight) / 2);
  const textX = Math.round(padding + displayLogoWidth + logoPadding + textWidth / 2);
  const textY = Math.round(height / 2 + (logoQuality === 'ultra' ? 6 : 5.5));
  
  // Quality-specific rendering attributes
  const qualityAttributes = logoQuality === 'ultra' 
    ? 'shape-rendering="geometricPrecision" text-rendering="optimizeLegibility" color-rendering="optimizeQuality"'
    : logoQuality === 'high' 
    ? 'shape-rendering="geometricPrecision" text-rendering="optimizeLegibility"'
    : 'shape-rendering="auto" text-rendering="auto"';
  
  const svg = `<svg width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg" ${qualityAttributes}>
    <defs>
      ${logoQuality === 'ultra' ? `
      <filter id="logoEnhance" x="0%" y="0%" width="100%" height="100%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="1.02 0 0 0 0  0 1.02 0 0 0  0 0 1.02 0 0  0 0 0 1 0" result="enhanced"/>
        <feComponentTransfer in="enhanced">
          <feFuncA type="discrete" tableValues="0 .5 1"/>
        </feComponentTransfer>
      </filter>` : ''}
    </defs>
    <rect width="${totalWidth}" height="${height}" fill="${color}" rx="4" ry="4" style="shape-rendering: geometricPrecision;"/>
    ${logoData ? `<image href="${logoData.dataUri}" x="${logoX}" y="${logoY}" width="${displayLogoWidth}" height="${displayLogoHeight}" style="image-rendering: -webkit-optimize-contrast; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges;${logoQuality === 'ultra' ? ' filter: url(#logoEnhance);' : ''}"/>` : ''}
    <text x="${textX}" y="${textY}" text-anchor="middle" fill="${finalTextColor}" font-size="${logoQuality === 'ultra' ? '15' : '14'}" font-weight="500" font-family="${fontFamily}" style="text-rendering: optimizeLegibility; letter-spacing: ${logoQuality === 'ultra' ? '0.03em' : '0.02em'}; text-shadow: ${logoQuality === 'ultra' ? '0 0 1px rgba(0,0,0,0.1)' : 'none'};">${text}</text>
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
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