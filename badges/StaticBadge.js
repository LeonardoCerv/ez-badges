const { generateIcon } = require('../utils/iconUtils');
const { generateBadgeSvg } = require('../utils/badgeUtils');

/**
 * Generates a static badge based on provided parameters.
 * @param {Object} params - Badge parameters
 * @param {string} params.text - Badge text
 * @param {string} params.icon - Icon source
 * @param {string} params.bgColor - Background color
 * @param {string} params.iconColor - Icon color
 * @param {string} params.textColor - Text color
 * @param {string} params.edges - Corner style
 * @returns {string} SVG badge
 */
async function generateStaticBadge({ text, icon, bgColor = 'white', iconColor, textColor = 'white', edges = 'squared' }) {
  const iconData = await generateIcon(icon, iconColor);
  return generateBadgeSvg(text, bgColor, iconData, textColor, edges);
}

module.exports = { generateStaticBadge };