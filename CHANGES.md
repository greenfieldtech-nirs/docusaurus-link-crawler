# Changelog for docusaurus-link-crawler

## v0.1.1 (2024-05-04)

### Features
- Renamed package from `devsite-link-checker` to `docusaurus-link-crawler`
- Updated binary name to match the new package name
- Updated documentation to reflect the focus on Docusaurus sites
- Updated all references in code and documentation

## v0.1.0 (2024-05-04)

### Features
- Made URL a required command-line argument
- Added executable shebang line for CLI usage
- Added binary entry point in package.json
- Simplified npm scripts to use the new command-line pattern
- Improved command-line argument parsing with support for:
  - Positional URL argument
  - `--url <url>` named argument
  - Better error messages for missing URL
- Added global installation support

### Documentation
- Updated README.md with new usage instructions
- Updated CLAUDE.md to reflect new CLI interface
- Updated CHANGES.md with version history

## v1.0.0 (2024-05-04)

### Features
- Initial implementation of website crawler for checking broken links
- Support for detecting both HTTP errors and "Page Not Found" messages in content
- Multiple detection methods with fallback mechanisms:
  - JavaScript-enabled crawling with Puppeteer
  - Static HTML parsing with Cheerio
  - Curl fallback for edge cases
- Comprehensive reporting options:
  - Tabular summary of all broken links
  - Verbose mode for immediate reporting
  - Debug mode for detailed logging
- Progress indicators during crawling:
  - Dots (.) for successfully crawled pages
  - Crosses (×) for pages with broken links
  - Periodic status updates
- Command-line options:
  - `-v` or `--verbose` for detailed output
  - `--use-puppeteer` for JavaScript support

### Technical Implementation
- Core architecture using Node.js
- Hybrid approach for link discovery and checking
- Multiple detection strategies with graceful fallbacks
- Async/await patterns for handling concurrent operations
- Smart URL handling with proper normalization
- Domain-specific crawling to stay within the target website

### Dependencies
- Added axios for HTTP requests
- Added cheerio for HTML parsing
- Added puppeteer-core for JavaScript rendering

### Documentation
- Created README.md with usage instructions
- Added CLAUDE.md for AI agent guidance
- Created CHANGES.md for version history