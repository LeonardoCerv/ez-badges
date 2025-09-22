# EZ Badges

A dynamic SVG badge generator inspired by img.shields.io, featuring the ability to use your own image paths and convert them into SVG badges for your README files.

**Note:** The `iconColor` parameter works reliably with supported icon libraries but may have limitations with custom image paths.

[![Views](https://badges.0xleo.dev/badge/dynamic/viewers?repo=leonardocerv/ez-badges&textColor=red&icon=simple-icons:eye&v=1234567890)](https://github.com/LeonardoCerv/ez-badges)
[![JavaScript](https://badges.0xleo.dev/badge?text=JavaScript&bgColor=amber&edges=squared&textColor=white&iconColor=white&icon=simple-icons:javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://badges.0xleo.dev/badge?text=NodeJS&bgColor=green&edges=squared&textColor=white&iconColor=white&icon=simple-icons:nodedotjs)](https://nodejs.org)
[![Express](https://badges.0xleo.dev/badge?text=Express&bgColor=white&textColor=black&icon=simple-icons:express)](https://expressjs.com)
[![Sharp](https://badges.0xleo.dev/badge?text=Sharp&bgColor=olive&iconColor=white&icon=simple-icons:sharp)](https://sharp.pixelplumbing.com)

## Quick Start

Visit [https://badges.0xleo.dev](https://badges.0xleo.dev) to explore the interactive badge builder and see all available options and examples.

For local development, see the Development section below.

## Cache Control

EZ Badges uses a hybrid caching approach similar to Shields.io to balance performance with freshness:

### Default Behavior
- **Static badges**: Cached for 1 hour for better performance
- **Dynamic badges**: No caching by default, but GitHub may still cache briefly (~5 minutes)

### Cache Control Options

#### Instant Updates (Maximum Cache Busting)
Append `?v=timestamp` to any badge URL for instant updates:
```
https://badges.0xleo.dev/badge/dynamic/viewers?repo=owner/repo&v=1234567890
```

This sets maximum cache-busting headers and forces fresh data on every request.

#### Custom Cache Duration
Use `?cacheSeconds=N` to set a specific cache duration:
```
https://badges.0xleo.dev/badge/dynamic/stars?repo=owner/repo&cacheSeconds=300
```

This caches the badge for 5 minutes (300 seconds).

### GitHub README Usage
- **For frequently updating badges**: Use `?v=timestamp` in your README
- **For stable badges**: Use default caching for better performance
- **For custom timing**: Use `?cacheSeconds=N` for specific intervals

**Note**: GitHub's Camo service may still cache images briefly regardless of headers.

## Dynamic Badge Customization

Dynamic badges now support custom text labels to make them more descriptive. Use the `text` parameter to add a prefix to your dynamic values:

### Examples

#### View Counter with Custom Label
```
https://badges.0xleo.dev/badge/dynamic/viewers?repo=owner/repo&text=Views
```
Shows: "Views: 123"

#### Stars with Custom Label
```
https://badges.0xleo.dev/badge/dynamic/stars?repo=owner/repo&text=Stars
```
Shows: "Stars: 456"

#### Downloads with Custom Label
```
https://badges.0xleo.dev/badge/dynamic/downloads?package=your-package&text=Downloads
```
Shows: "Downloads: 789"

### Combining with Other Parameters

You can combine the `text` parameter with icons, colors, and cache control:

```
https://badges.0xleo.dev/badge/dynamic/viewers?repo=owner/repo&text=Profile%20Views&icon=simple-icons:eye&bgColor=blue&textColor=white&v=timestamp
```

This creates a badge showing "Profile Views: 123" with an eye icon, blue background, and cache busting.

## Contributing

We welcome contributions! EZ Badges is an open-source project and we appreciate help from developers of all skill levels.

### Ways to Contribute

#### Code Contributions
- Bug Fixes: Found a bug? Fix it and submit a PR!
- New Features: Have an idea for a new badge style or functionality?
- Performance Improvements: Help optimize the badge generation process
- Security Enhancements: Improve sanitization or add security features

#### Feature Ideas
We're always looking for new badge styles and features! Some ideas:
- New edge styles (curved, wavy, or custom border styles)
- Gradient backgrounds
- Animated badges
- Badge templates for common use cases
- Internationalization support
- Responsive badges
- Special effects (glow, shadow, etc.)
- API improvements for programmatic access

#### Documentation
- Improve examples and tutorials
- Add more use cases and real-world examples
- Translate documentation to other languages
- Create video tutorials or blog posts

### How to Contribute

#### 1. Fork & Clone
```bash
git clone https://github.com/LeonardoCerv/ez-badges.git
cd ez-badges
npm install
```

#### 2. Create a Feature Branch
```bash
git checkout -b feature/your-awesome-feature
# or
git checkout -b fix/issue-description
```

#### 3. Make Your Changes
- Follow the existing code style
- Add tests for new features
- Update documentation if needed
- Test your changes thoroughly

#### 4. Test Your Changes
```bash
npm start
# Visit http://localhost:3000 to test your changes
```

#### 5. Submit a Pull Request
1. Push your branch to your fork
2. Create a Pull Request on GitHub
3. Describe your changes clearly
4. Reference any related issues

### Development Guidelines

#### Code Style
- Use consistent indentation (2 spaces)
- Follow JavaScript/Node.js best practices
- Add comments for complex logic
- Keep functions small and focused

#### Testing
- Test with different badge configurations
- Verify GitHub README compatibility
- Check edge cases and error handling
- Test with various image formats

#### Documentation
- Update README for new features
- Add JSDoc comments for new functions
- Include examples in your PR description

### Current Priorities

We're particularly interested in contributions for:
- Performance optimizations for faster badge generation
- New badge styles and customization options
- Better error handling and user feedback
- Accessibility improvements for screen readers
- Mobile optimization for smaller screens

### Getting Help

- Issues: [Report bugs or request features](https://github.com/LeonardoCerv/ez-badges/issues)
- Discussions: [Share ideas and get feedback](https://github.com/LeonardoCerv/ez-badges/discussions)

### Recognition

All contributors will be:
- Listed in our contributors file
- Mentioned in release notes
- Featured in our documentation
- Given credit for their awesome work!

Ready to contribute? Check out our Issues page for good first issues, or create your own feature request!

## License & Terms

See Terms of Use for detailed usage terms.

## Contact

- Web Interface: [https://badges.0xleo.dev](https://badges.0xleo.dev)
- GitHub: [LeonardoCerv/ez-badges](https://github.com/LeonardoCerv/ez-badges)
- Issues: [Report Issues](https://github.com/LeonardoCerv/ez-badges/issues)
