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

module.exports = { COLORS, ICON_PROVIDERS };