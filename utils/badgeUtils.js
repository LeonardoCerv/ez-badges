const { parseColor } = require('./colorUtils');

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

module.exports = { generateBadgeSvg };