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

async function fetchFavicon(url) {
  try {
    // Normalize URL
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Try common favicon locations with different formats
    const faviconUrls = [
      // Standard locations
      `${baseUrl}/favicon.ico`,
      `${baseUrl}/favicon.png`,
      `${baseUrl}/favicon.svg`,
      `${baseUrl}/favicon.webp`,

      // Apple touch icons
      `${baseUrl}/apple-touch-icon.png`,
      `${baseUrl}/apple-touch-icon-precomposed.png`,
      `${baseUrl}/apple-touch-icon-152x152.png`,
      `${baseUrl}/apple-touch-icon-144x144.png`,
      `${baseUrl}/apple-touch-icon-120x120.png`,
      `${baseUrl}/apple-touch-icon-114x114.png`,
      `${baseUrl}/apple-touch-icon-76x76.png`,
      `${baseUrl}/apple-touch-icon-72x72.png`,
      `${baseUrl}/apple-touch-icon-60x60.png`,

      // Android icons
      `${baseUrl}/android-chrome-512x512.png`,
      `${baseUrl}/android-chrome-192x192.png`,
      `${baseUrl}/android-chrome-144x144.png`,
      `${baseUrl}/android-chrome-96x96.png`,
      `${baseUrl}/android-chrome-72x72.png`,
      `${baseUrl}/android-chrome-48x48.png`,

      // Generic icons
      `${baseUrl}/icon.png`,
      `${baseUrl}/icon.svg`,
      `${baseUrl}/logo.png`,
      `${baseUrl}/logo.svg`,

      // Common subdirectories
      `${baseUrl}/assets/favicon.ico`,
      `${baseUrl}/assets/favicon.png`,
      `${baseUrl}/assets/icon.png`,
      `${baseUrl}/static/favicon.ico`,
      `${baseUrl}/static/favicon.png`,
      `${baseUrl}/images/favicon.ico`,
      `${baseUrl}/images/favicon.png`,
      `${baseUrl}/img/favicon.ico`,
      `${baseUrl}/img/favicon.png`
    ];

    // Try each favicon URL
    for (const faviconUrl of faviconUrls) {
      try {
        const response = await axios.get(faviconUrl, {
          responseType: 'arraybuffer',
          timeout: 3000,
          validateStatus: (status) => status < 400,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
          }
        });

        if (response.data && response.data.length > 0 && response.data.length < 2 * 1024 * 1024) {
          const buffer = Buffer.from(response.data);
          
          // Validate that this is actually image data, not an HTML error page
          const bufferStart = buffer.toString('utf8', 0, Math.min(100, buffer.length));
          if (bufferStart.includes('<html') || bufferStart.includes('<!DOCTYPE') || bufferStart.includes('404')) {
            console.warn('Favicon URL returned HTML instead of image:', faviconUrl);
            continue;
          }
          
          // Check for common image format signatures
          const bufferHex = buffer.toString('hex', 0, 8);
          const isValidImage = bufferHex.startsWith('89504e47') || // PNG
                              bufferHex.startsWith('ffd8ff') ||   // JPEG
                              bufferHex.startsWith('47494638') || // GIF
                              bufferHex.startsWith('52494646') || // WebP/RIFF
                              buffer.toString('utf8', 0, 5).includes('<svg'); // SVG
          
          if (isValidImage) {
            console.log('Found valid favicon:', faviconUrl);
            return buffer;
          } else {
            console.warn('Favicon URL returned invalid image format:', faviconUrl);
          }
        }
      } catch (error) {
        // Continue to next favicon URL
        continue;
      }
    }

    // If no favicon found, try to parse HTML for favicon links and manifest
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
        }
      });
      const html = response.data;

      // Look for manifest.json
      const manifestMatch = html.match(/<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["'][^>]*>/i);
      if (manifestMatch && manifestMatch[1]) {
        try {
          let manifestHref = manifestMatch[1].trim();
          
          // Skip invalid manifest URLs
          if (!manifestHref || manifestHref === '/' || manifestHref === 'https' || manifestHref === 'http') {
            // Skip invalid manifest URLs
          } else {
            const manifestUrl = manifestHref.startsWith('http') ? manifestHref :
                              manifestHref.startsWith('//') ? `https:${manifestHref}` :
                              manifestHref.startsWith('/') ? `${baseUrl}${manifestHref}` :
                              `${baseUrl}/${manifestHref}`;

            const manifestResponse = await axios.get(manifestUrl, { 
              timeout: 3000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
              }
            });
            const manifest = manifestResponse.data;

            if (manifest && manifest.icons && Array.isArray(manifest.icons)) {
              // Sort by size (prefer larger icons)
              const sortedIcons = manifest.icons.sort((a, b) => {
                const sizeA = parseInt(a.sizes?.split('x')[0] || 0);
                const sizeB = parseInt(b.sizes?.split('x')[0] || 0);
                return sizeB - sizeA;
              });

              for (const icon of sortedIcons) {
                if (icon.src) {
                  try {
                    let iconSrc = icon.src.trim();
                    
                    // Skip invalid icon URLs
                    if (!iconSrc || iconSrc === '/' || iconSrc === 'https' || iconSrc === 'http') {
                      continue;
                    }
                    
                    const iconUrl = iconSrc.startsWith('http') ? iconSrc :
                                  iconSrc.startsWith('//') ? `https:${iconSrc}` :
                                  iconSrc.startsWith('/') ? `${baseUrl}${iconSrc}` :
                                  `${baseUrl}/${iconSrc}`;

                    const iconResponse = await axios.get(iconUrl, {
                      responseType: 'arraybuffer',
                      timeout: 3000,
                      headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
                      }
                    });

                    if (iconResponse.data && iconResponse.data.length > 0) {
                      const buffer = Buffer.from(iconResponse.data);
                      
                      // Validate that this is actually image data
                      const bufferStart = buffer.toString('utf8', 0, Math.min(100, buffer.length));
                      if (bufferStart.includes('<html') || bufferStart.includes('<!DOCTYPE') || bufferStart.includes('404')) {
                        console.warn('Manifest icon returned HTML instead of image:', iconUrl);
                        continue;
                      }
                      
                      // Check for valid image format
                      const bufferHex = buffer.toString('hex', 0, 8);
                      const isValidImage = bufferHex.startsWith('89504e47') || // PNG
                                          bufferHex.startsWith('ffd8ff') ||   // JPEG
                                          bufferHex.startsWith('47494638') || // GIF
                                          bufferHex.startsWith('52494646') || // WebP/RIFF
                                          buffer.toString('utf8', 0, 5).includes('<svg'); // SVG
                      
                      if (isValidImage) {
                        console.log('Found valid manifest icon:', iconUrl);
                        return buffer;
                      } else {
                        console.warn('Manifest icon returned invalid format:', iconUrl);
                      }
                    }
                  } catch (error) {
                    continue;
                  }
                }
              }
            }
          }
        } catch (error) {
          // Manifest parsing failed, continue
        }
      }

      // Look for favicon links in HTML with various rel attributes
      const faviconRegex = /<link[^>]*rel=["'](?:shortcut )?(?:icon|apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let match;
      const foundFavicons = [];

      while ((match = faviconRegex.exec(html)) !== null) {
        foundFavicons.push(match[1]);
      }

      // Try each found favicon
      for (const faviconPath of foundFavicons) {
        try {
          let faviconHref = faviconPath.trim();
          
          // Skip invalid favicon URLs
          if (!faviconHref || faviconHref === '/' || faviconHref === 'https' || faviconHref === 'http') {
            continue;
          }
          
          const faviconUrl = faviconHref.startsWith('http') ? faviconHref :
                           faviconHref.startsWith('//') ? `https:${faviconHref}` :
                           faviconHref.startsWith('/') ? `${baseUrl}${faviconHref}` :
                           `${baseUrl}/${faviconHref}`;

          const faviconResponse = await axios.get(faviconUrl, {
            responseType: 'arraybuffer',
            timeout: 3000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
            }
          });

          if (faviconResponse.data && faviconResponse.data.length > 0) {
            return Buffer.from(faviconResponse.data);
          }
        } catch (error) {
          continue;
        }
      }

      // Look for Open Graph images as fallback
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (ogImageMatch && ogImageMatch[1]) {
        try {
          let ogImageHref = ogImageMatch[1].trim();
          
          // Skip invalid OG image URLs
          if (!ogImageHref || ogImageHref === '/' || ogImageHref === 'https' || ogImageHref === 'http') {
            // Skip invalid URLs
          } else {
            const ogImageUrl = ogImageHref.startsWith('http') ? ogImageHref :
                             ogImageHref.startsWith('//') ? `https:${ogImageHref}` :
                             ogImageHref.startsWith('/') ? `${baseUrl}${ogImageHref}` :
                             `${baseUrl}/${ogImageHref}`;

            const ogResponse = await axios.get(ogImageUrl, {
              responseType: 'arraybuffer',
              timeout: 3000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
              }
            });

            if (ogResponse.data && ogResponse.data.length > 0 && ogResponse.data.length < 2 * 1024 * 1024) {
              return Buffer.from(ogResponse.data);
            }
          }
        } catch (error) {
          // Continue
        }
      }

    } catch (error) {
      console.error('HTML parsing failed:', error.message);
    }

    return null; // No favicon found
  } catch (error) {
    console.error('Error fetching favicon:', error);
    return null;
  }
}

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

async function processLogo(url, quality = 'high', isWebsite = false) {
  const cacheKey = `${url}_${quality}_${isWebsite ? 'website' : 'direct'}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  
  try {
    let buffer;
    
    if (isWebsite) {
      // Fetch favicon from website
      buffer = await fetchFavicon(url);
      if (!buffer) {
        console.warn('No favicon found for website:', url);
        return null;
      }
    } else {
      // Direct image URL
      const response = await axios.get(url, { 
        responseType: 'arraybuffer', 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BadgeGenerator/1.0)'
        }
      });
      buffer = Buffer.from(response.data);
    }
    
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
    const widthMatch = sanitizedSvg.match(/width=["']?([0-9]+)["']?/);
    const heightMatch = sanitizedSvg.match(/height=["']?([0-9]+)["']?/);

    let width = 32, height = 32; // default

    if (viewBoxMatch) {
      const viewBox = viewBoxMatch[1].split(/\s+/);
      if (viewBox.length >= 4) {
        width = parseInt(viewBox[2]) || 32;
        height = parseInt(viewBox[3]) || 32;
      }
    } else if (widthMatch && heightMatch) {
      width = parseInt(widthMatch[1]) || 32;
      height = parseInt(heightMatch[1]) || 32;
    }

    // Ensure high-resolution dimensions
    width = Math.max(24, Math.min(width, 400));
    height = Math.max(24, Math.min(height, 400));

    // Adjust for quality setting with higher resolution scaling
    const scaleFactor = quality === 'ultra' ? 2.5 : quality === 'high' ? 2.0 : 1.5;
    width = Math.round(width * scaleFactor);
    height = Math.round(height * scaleFactor);

    // Enhance the SVG with quality attributes
    let enhancedSvg = sanitizedSvg;
    if (!enhancedSvg.includes('shape-rendering')) {
      enhancedSvg = enhancedSvg.replace('<svg', '<svg shape-rendering="geometricPrecision"');
    }

    const base64 = Buffer.from(enhancedSvg).toString('base64');
    const dataUri = `data:image/svg+xml;base64,${base64}`;
    
    console.log('Successfully processed SVG:', width, 'x', height);
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
    
    // Calculate target dimensions for ultra-high quality (much larger)
    const baseHeight = quality === 'ultra' ? 80 : quality === 'high' ? 64 : 48;
    const aspectRatio = metadata.width / metadata.height;
    let targetWidth = Math.round(baseHeight * aspectRatio);
    let targetHeight = baseHeight;
    
    // Allow much larger dimensions for crisp rendering
    const maxWidth = quality === 'ultra' ? 400 : quality === 'high' ? 320 : 240;
    if (targetWidth > maxWidth) {
      targetWidth = maxWidth;
      targetHeight = Math.round(targetWidth / aspectRatio);
    }

    // Process with ultra-high quality settings and supersampling
    let processedBuffer;
    if (metadata.width < targetWidth * 2 && metadata.height < targetHeight * 2) {
      // For small source images, use supersampling
      const supersampleFactor = 2;
      const supersampleWidth = targetWidth * supersampleFactor;
      const supersampleHeight = targetHeight * supersampleFactor;
      
      const supersampledBuffer = await sharp(buffer)
        .resize(supersampleWidth, supersampleHeight, {
          fit: 'inside',
          withoutEnlargement: false,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        })
        .modulate({ brightness: 1.02, saturation: 1.05 }) // Enhance colors slightly
        .sharpen({ sigma: 0.3, m1: 1.0, m2: 2.0 })
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
      
      // Now downsample to target size with high quality
      processedBuffer = await sharp(supersampledBuffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
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
      // For high-res source images, direct processing
      processedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        })
        .modulate({ brightness: 1.02, saturation: 1.05 }) // Enhance colors slightly
        .sharpen({ sigma: 0.5, m1: 1.0, m2: 2.0 })
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

    // Convert to base64 and wrap in ultra-high-quality SVG
    const base64 = processedBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    const svg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" xmlns="http://www.w3.org/2000/svg" style="image-rendering: -webkit-optimize-contrast; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated;">
      <image href="${dataUri}" width="${targetWidth}" height="${targetHeight}" x="0" y="0" style="image-rendering: -webkit-optimize-contrast; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated;"/>
    </svg>`;

    const svgBase64 = Buffer.from(svg).toString('base64');
    const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;

    console.log('Successfully processed pixel image to SVG:', targetWidth, 'x', targetHeight);
    return { dataUri: svgDataUri, width: targetWidth, height: targetHeight };
  } catch (error) {
    console.error('Error processing pixel image:', error.message);
    return null;
  }
}

// Badge generation endpoint
app.get('/badge', async (req, res) => {
  const { text = 'Badge', color = 'blue', logo, website, textColor = 'white', fontFamily = 'Verdana, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif', autoContrast = 'true', logoQuality = 'high' } = req.query;
  let logoData = null;
  
  // Priority: website favicon > direct logo URL
  if (website) {
    console.log('Fetching favicon for website:', website);
    logoData = await processLogo(website, logoQuality, true);
    if (logoData) {
      cache.set(`${website}_${logoQuality}_website`, logoData);
    }
  } else if (logo) {
    console.log('Processing direct logo URL:', logo);
    logoData = await processLogo(logo, logoQuality, false);
    if (logoData) {
      cache.set(`${logo}_${logoQuality}_direct`, logoData);
    }
  }

  // Auto-adjust text color for better contrast if enabled
  let finalTextColor = textColor;
  if (autoContrast === 'true') {
    finalTextColor = getOptimalTextColor(color, textColor);
  }

  const logoWidth = logoData ? logoData.width : 0;
  const logoHeight = logoData ? logoData.height : 24;
  
  // Scale down large logos for badge display while keeping quality
  let displayLogoWidth = logoWidth;
  let displayLogoHeight = logoHeight;
  const maxDisplayHeight = 32;
  
  if (logoHeight > maxDisplayHeight) {
    const scale = maxDisplayHeight / logoHeight;
    displayLogoWidth = Math.round(logoWidth * scale);
    displayLogoHeight = maxDisplayHeight;
  }
  
  // Better text width calculation using modern font metrics
  const avgCharWidth = 7.8;
  const textWidth = Math.ceil(text.length * avgCharWidth);
  
  const padding = 16;
  const logoPadding = logoData ? 8 : 0;
  const height = Math.max(40, displayLogoHeight + 8); // Accommodate larger logos
  const totalWidth = padding + displayLogoWidth + logoPadding + textWidth + padding;
  
  // Pixel-perfect positioning
  const logoX = padding;
  const logoY = Math.round((height - displayLogoHeight) / 2);
  const textX = Math.round(padding + displayLogoWidth + logoPadding + textWidth / 2);
  const textY = Math.round(height / 2 + 5.5);
  
  const svg = `<svg width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg" style="shape-rendering: geometricPrecision; text-rendering: optimizeLegibility;">
    <rect width="${totalWidth}" height="${height}" fill="${color}" rx="4" ry="4"/>
    ${logoData ? `<image href="${logoData.dataUri}" x="${logoX}" y="${logoY}" width="${displayLogoWidth}" height="${displayLogoHeight}" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;"/>` : ''}
    <text x="${textX}" y="${textY}" text-anchor="middle" fill="${finalTextColor}" font-size="14" font-weight="500" font-family="${fontFamily}" style="text-rendering: optimizeLegibility; letter-spacing: 0.02em;">${text}</text>
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