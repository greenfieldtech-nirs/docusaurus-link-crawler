# Docusaurus Link Crawler

A tool specifically designed for crawling Docusaurus documentation sites and detecting broken links, including URLs that return 200 OK but contain a "Page Not Found" message.

## Features

- Crawls any website specified via command line
- Detects broken links by HTTP status codes and content analysis
- Multiple link detection methods including standard HTTP and curl fallback
- Real-time progress display with page counts and performance metrics
- Immediate broken link reporting (optional verbose mode)
- Robust error handling for network issues and timeouts
- Follows links within the same domain
- Provides a comprehensive report of all broken links organized by the pages containing them

## Installation

```bash
# Local installation
npm install

# Optional: Install globally
npm install -g .
```

## Usage

### Basic Usage

```bash
# Using npm
npm run check http://example.com/

# Direct execution
node index.js http://example.com/

# If installed globally
docusaurus-link-crawler http://example.com/
```

### Command-line Options

```bash
node index.js [options] <url>

Options:
  -v, --verbose       Show detailed output with broken links as they're found
  --use-puppeteer     Enable JavaScript execution for dynamic websites
  --url <url>         Specify URL (alternative to positional argument)

Examples:
  node index.js http://localhost:3000/
  node index.js -v http://localhost:3000/
  node index.js --use-puppeteer http://example.com/
  node index.js --use-puppeteer -v http://example.com/
  node index.js --url http://example.com/ --verbose
```

### Debug Mode

```bash
DEBUG=true node index.js http://example.com/
```

## Output

The crawler shows progress during execution with a dot (.) for each page without errors and a cross (×) for pages with broken links. At the end, it displays a table summarizing all broken links found.

## Output Format

The program will output a list of pages and any broken links they contain, along with the reason why the link is considered broken.

Example output:

```
Crawl Results:
==============

Page: http://localhost:3000/about
Broken links:
- http://localhost:3000/team (Page Not Found message in content)
- http://localhost:3000/contact (HTTP 404: Request failed with status code 404)
```