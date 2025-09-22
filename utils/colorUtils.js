const { COLORS } = require('./constants');

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

module.exports = { parseColor, changeSvgColor };