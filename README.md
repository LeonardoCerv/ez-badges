# EZ Badges

A modern, dynamic SVG badge generator with perfect GitHub README integration. Generate beautiful, scalable badges with custom text, colors, icons, and edge styles.

[![Node.js Badge](https://badges.0xleo.dev/badge?text=Node.js&bgColor=green&icon=https://nodejs.org/static/images/logo.svg)](https://badges.0xleo.dev)
[![React Badge](https://badges.0xleo.dev/badge?text=React&bgColor=blue&icon=https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg)](https://badges.0xleo.dev)
[![TypeScript Badge](https://badges.0xleo.dev/badge?text=TypeScript&bgColor=blue&edges=pill)](https://badges.0xleo.dev)

## ✨ Features

- **Dynamic Width**: Automatically adjusts badge width based on content
- **Customizable Edges**: Rounded, square, or pill-shaped badges
- **Icon Support**: High-quality SVG and pixel image processing
- **Perfect GitHub Integration**: Works flawlessly in README files
- **Smart Colors**: Automatic text contrast optimization
- **High Performance**: Optimized SVG generation with caching
- **Secure**: SVG sanitization and rate limiting

## 🚀 Quick Start

Visit [https://badges.0xleo.dev](https://badges.0xleo.dev) to explore the interactive badge builder and see all available options and examples.

For local development, see the [Development](#-development) section below.

## �️ Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Local Setup

```bash
# Clone the repository
git clone https://github.com/LeonardoCerv/ez-badges.git
cd ez-badges

# Install dependencies
npm install

# Start development server
npm start

# Server will be available at http://localhost:3000
```

### Project Structure

```
ez-badges/
├── server.js          # Main application server
├── index.html         # Landing page with interactive builder
├── terms.html         # Terms of use page
├── package.json       # Dependencies and scripts
└── README.md          # This file
```

### API Endpoints

- `GET /` - Landing page with interactive badge builder
- `GET /badge` - Generate badge (see web interface for parameters)
- `GET /terms` - Terms of use

## 🤝 Contributing

We welcome contributions! EZ Badges is an open-source project and we appreciate help from developers of all skill levels.

### Ways to Contribute

#### Code Contributions
- **Bug Fixes**: Found a bug? Fix it and submit a PR!
- **New Features**: Have an idea for a new badge style or functionality?
- **Performance Improvements**: Help optimize the badge generation process
- **Security Enhancements**: Improve sanitization or add security features

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

- **Issues**: [Report bugs or request features](https://github.com/LeonardoCerv/ez-badges/issues)
- **Discussions**: [Share ideas and get feedback](https://github.com/LeonardoCerv/ez-badges/discussions)

### Recognition

All contributors will be:
- Listed in our contributors file
- Mentioned in release notes
- Featured in our documentation
- Given credit for their awesome work!

**Ready to contribute?** Check out our [Issues](https://github.com/LeonardoCerv/ez-badges/issues) page for good first issues, or create your own feature request!

## 📄 License & Terms

See [Terms of Use](https://badges.0xleo.dev/terms) for detailed usage terms.

## 📞 Contact

- **Web Interface**: [https://badges.0xleo.dev](https://badges.0xleo.dev)
- **GitHub**: [LeonardoCerv/ez-badges](https://github.com/LeonardoCerv/ez-badges)
- **Issues**: [Report Issues](https://github.com/LeonardoCerv/ez-badges/issues)

---

**Made with ❤️ by [LeonardoCerv](https://github.com/LeonardoCerv)**