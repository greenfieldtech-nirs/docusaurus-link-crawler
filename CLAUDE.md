# Claude Instructions for docusaurus-link-crawler

## Project Description
This is a Node.js tool specifically designed for crawling Docusaurus documentation websites and detecting broken links. It checks for both HTTP errors and pages that return 200 OK but contain "Page Not Found" messages. The tool accepts a URL as a command line argument and explores all links within the same domain.

## Commands
- **Install**: `npm install` or `npm install -g .` (global)
- **Run**: `node index.js <url>` or `docusaurus-link-crawler <url>` (if installed globally)
- **Run with Options**:
  - Verbose: `node index.js -v <url>` or `node index.js --verbose <url>`
  - JS Support: `node index.js --use-puppeteer <url>`
  - Both: `node index.js --use-puppeteer -v <url>`
- **Debug Mode**: `DEBUG=true node index.js <url>`

## Implementation Guidelines
When enhancing or modifying this tool, ensure:

1. **Core Functionality**:
   - Accept URL as a command line argument
   - Crawl from the specified URL
   - Parse HTML to find links (with support for JavaScript-rendered content)
   - Follow links within the same domain 
   - Detect broken links (HTTP errors & "Page Not Found" messages in content)
   - Build a comprehensive report of broken links

2. **Output Formats**:
   - Support both quiet (table-based summary) and verbose modes
   - Include source page, broken link URL, and reason for each broken link
   - Show clean, formatted progress during crawling
   - Provide meaningful status updates and error messages

3. **Architecture**:
   - JavaScript/Node.js with async/await patterns for concurrency
   - Hybrid approach for link discovery (HTTP requests with optional Puppeteer)
   - Modular functions for page processing and link checking

## Code Style
- **Formatting**: 2-space indentation
- **Naming**: camelCase for variables/functions
- **String Quotes**: Single quotes for strings
- **Error Handling**: try/catch blocks for HTTP requests and parsing
- **Async Code**: Use async/await pattern

## Dependencies
- axios: For HTTP requests
- cheerio: For HTML parsing
- puppeteer-core: For JavaScript-enabled page rendering