# EZ Badges

A simple dynamic SVG badge generator with support for external logos.

## Features

- Generate clean, minimal SVG badges with custom text and colors
- Embed external logos (SVG sanitized, pixel formats converted to SVG for quality)
- Simple, flat design without shadows or effects
- In-memory LRU cache for performance
- Rate limiting to prevent abuse
- Fallback handling for failed logo processing
- **SVG Support**: Direct SVG logos with sanitization, pixel images converted to SVG

## Usage

Start the server:

```bash
npm install
npm start
```

Access the landing page at `http://localhost:3000`

Generate a badge: `http://localhost:3000/badge?text=Hello&color=blue&logo=https://example.com/logo.png&textColor=white`

Embed in Markdown:

```markdown
![Badge](http://localhost:3000/badge?text=Status&color=#6366f1&logo=https://example.com/logo.png&textColor=white)
```

## Auto Contrast Feature

The badge generator includes intelligent text color adjustment based on WCAG contrast guidelines:

- **Automatic Mode** (`autoContrast=true`): Analyzes background color and chooses white or black text for optimal readability
- **Manual Mode** (`autoContrast=false`): Uses your specified `textColor`
- **WCAG Compliant**: Ensures contrast ratio ≥ 4.5:1 for accessibility
- **Smart Fallback**: If your chosen text color already has good contrast, it keeps your preference

### Examples

```bash
# Basic badge
http://localhost:3000/badge?text=Hello&color=blue

# With direct logo URL
http://localhost:3000/badge?text=Node.js&logo=https://nodejs.org/static/images/logo.svg&color=green

# High quality processing
http://localhost:3000/badge?text=React&logo=https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg&logoQuality=ultra

# Custom styling
http://localhost:3000/badge?text=Vue.js&logo=https://vuejs.org/logo.svg&color=#4FC08D&textColor=white
```

## Parameters

- `text`: Badge text (default: 'Badge')
- `color`: Background color (default: 'blue')
- `logo`: URL to external logo image
- `textColor`: Text color (default: 'white', auto-adjusted for contrast)
- `fontFamily`: Font family for text (default: 'Verdana, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif')
- `autoContrast`: Auto-adjust text color for better contrast (default: 'true')
- `logoQuality`: Logo processing quality - 'ultra', 'high', or 'standard' (default: 'high')

## Logo Quality Options

Choose the appropriate quality level for your logos:

- **ultra**: Maximum quality (48px height, no compression) - Best for high-resolution logos
- **high**: Excellent quality (32px height, minimal compression) - Default, great balance
- **standard**: Good quality (24px height, balanced compression) - Smaller file sizes

```bash
# Ultra quality for high-res logos
/badge?text=Logo&logo=https://example.com/high-res.png&logoQuality=ultra

# High quality (default)
/badge?text=Logo&logo=https://example.com/logo.png&logoQuality=high

# Standard quality for faster loading
/badge?text=Logo&logo=https://example.com/logo.png&logoQuality=standard
```

## SVG Support

The badge generator now provides enhanced support for SVG logos:

### Direct SVG Logos
```bash
/badge?text=React&logo=https://reactjs.org/logo.svg
```

**Features:**
- Automatic SVG detection by content-type, file extension, or content analysis
- Sanitization using DOMPurify to prevent XSS attacks
- Preserves original SVG quality and scalability
- Extracts dimensions from viewBox for proper sizing

### Pixel to SVG Conversion
```bash
/badge?text=Node.js&logo=https://nodejs.org/logo.png
```

**Benefits:**
- Pixel images (PNG, JPG, GIF) are converted to SVG format
- Maintains high quality through optimized PNG processing
- Embeds processed image in SVG wrapper for scalability
- Better integration with SVG badge output

### Quality Preservation
- **SVG logos**: No quality loss, fully scalable vector graphics
- **Pixel logos**: Maximum quality PNG processing with zero compression
- **Smart resizing**: Only resizes when necessary, preserves original quality when possible
- **SVG embedding**: All pixel images converted to SVG format for consistent output
- **Fallback handling**: Unsupported formats get converted through multiple strategies (JPEG, WebP, TIFF)
- **Placeholder fallback**: When all conversion fails, shows a clean placeholder instead of breaking

## Examples
```

## Styling Features

- **Clean Design**: Simple, minimal badges without shadows or effects
- **Modern Typography**: Uses Verdana font with system font fallbacks
- **Solid Colors**: Clean, flat color backgrounds
- **Squared Edges**: Sharp, clean rectangular badges
- **Auto Contrast**: Automatically adjusts text color (white/black) for optimal readability
- **High-Quality Logos**: Advanced PNG processing with Lanczos3 resampling, adaptive filtering, and optimized compression
- **Responsive Layout**: Dynamic width based on content

## Troubleshooting

### Common Issues

**"Unsupported image format encountered, attempting alternative processing"**
- The system automatically tries multiple conversion strategies (JPEG, WebP, TIFF to PNG)
- If all strategies fail, a clean placeholder is shown instead of breaking the badge
- This ensures badges always render properly even with problematic images

**"Error converting pixel to SVG"**
- The image format may not be supported (try PNG, JPG, or WebP)
- The image may be corrupted or too large (>2MB)
- Automatic fallback to placeholder prevents badge failure

**Logo Overflow Issues**
- Fixed dimension mismatch between SVG container and image
- Proper aspect ratio preservation
- Smart scaling for images that are too large or too small

**"Unsupported image format"**
- Ensure your image is in a supported format (PNG, JPG, GIF, WebP, SVG)
- Check that the image URL is accessible and returns valid image data

### Supported Image Formats
- **SVG**: Sanitized and embedded directly
- **PNG/JPG/WebP**: Converted to high-quality SVG with zero compression
- **GIF**: Converted to PNG then SVG

### Quality Settings
- **ultra**: Maximum quality (64px height, no compression)
- **high**: Excellent quality (48px height, minimal compression) - Default
- **standard**: Good quality (32px height, balanced compression)

## Legal

See [Terms of Use](/terms). You are responsible for the content you use.

## Future Enhancements

- Redis cache
- CDN integration
- Additional formats (PNG badges)
- More styling options