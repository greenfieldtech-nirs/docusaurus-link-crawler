#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: null,
    usePuppeteer: args.includes('--use-puppeteer'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    debug: process.env.DEBUG === 'true',
  };
  
  // Find URL argument (first non-flag argument or --url value)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      options.url = args[i + 1];
      break;
    } else if (!args[i].startsWith('-') && !options.url) {
      options.url = args[i];
      break;
    }
  }
  
  return options;
}

// Get arguments
const args = parseArgs();

// Check if URL is provided
if (!args.url) {
  console.error('Error: URL is required.');
  console.error('Usage: docusaurus-link-crawler [--use-puppeteer] [--verbose|-v] <url>');
  console.error('   or: docusaurus-link-crawler --url <url> [--use-puppeteer] [--verbose|-v]');
  console.error('Example: docusaurus-link-crawler http://localhost:3000/');
  process.exit(1);
}

// Configuration
const startUrl = args.url;
const visitedUrls = new Set();
const brokenLinks = {};
const pageQueue = [startUrl];
const debug = args.debug;
const usePuppeteer = args.usePuppeteer;
const verbose = args.verbose;

// Puppeteer setup
let puppeteer;
let browser;
let puppeteerAvailable = false;

// Try to find Chrome or Chromium
async function findChrome() {
  const commonPaths = [
    // macOS paths
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux paths
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Windows paths
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  
  for (const path of commonPaths) {
    try {
      if (fs.existsSync(path)) {
        return path;
      }
    } catch (e) {
      // Skip if we can't access the path
    }
  }
  
  return null;
}

// Initialize Puppeteer if available
async function initPuppeteer() {
  if (!usePuppeteer) {
    if (debug) console.log('Using basic HTTP mode (no JavaScript)');
    return false;
  }
  
  try {
    puppeteer = require('puppeteer-core');
    const chromePath = await findChrome();
    
    if (!chromePath) {
      console.log('Could not find Chrome installation. Using basic HTTP mode.');
      return false;
    }
    
    if (debug) console.log(`Found Chrome at: ${chromePath}`);
    console.log('Launching browser with JavaScript support...');
    
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    console.log('Browser launched successfully.');
    return true;
  } catch (error) {
    console.log(`Failed to initialize browser: ${error.message}`);
    console.log('Using basic HTTP mode instead.');
    return false;
  }
}

// Helper function to run a command and get the output
async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) console.error(`stderr: ${stderr}`);
    return stdout.trim();
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    return '';
  }
}

// Use Node.js built-in URL module to check if a URL is in the same domain
function isSameDomain(url1, url2) {
  try {
    const parsedUrl1 = new URL(url1);
    const parsedUrl2 = new URL(url2);
    return parsedUrl1.hostname === parsedUrl2.hostname;
  } catch (error) {
    console.error(`Error checking domain: ${error.message}`);
    return false;
  }
}

// Check if a page contains "Page Not Found" message (Docusaurus specific)
function hasPageNotFoundMessage(content) {
  if (!content) return false;
  
  const $ = cheerio.load(content);
  const bodyText = $('body').text().toLowerCase();
  
  // Check for Docusaurus specific error messages
  const errorPatterns = [
    'page not found',
    '404',
    'not found',
    'does not exist',
    'error',
    'cannot be found',
    'this page was not found', // Docusaurus specific
    'we could not find what you were looking for', // Docusaurus specific
    'broken link' // Docusaurus specific
  ];
  
  for (const pattern of errorPatterns) {
    if (bodyText.includes(pattern)) {
      console.log(`Found error pattern in page: "${pattern}"`);
      return true;
    }
  }
  
  return false;
}

// Extract links using Puppeteer
async function extractLinksWithPuppeteer(pageUrl) {
  try {
    if (!puppeteerAvailable || !browser) {
      return { success: false, links: [] };
    }
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
      if (debug) console.log(`Loading page with JavaScript: ${pageUrl}`);
      await page.goto(pageUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Check if this is a 404 page (Docusaurus specific)
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.toLowerCase().includes('page not found') || 
          pageText.toLowerCase().includes('404') ||
          pageText.toLowerCase().includes('not found') ||
          pageText.toLowerCase().includes('this page was not found') ||
          pageText.toLowerCase().includes('we could not find what you were looking for') ||
          pageText.toLowerCase().includes('broken link')) {
        if (debug) console.log(`Found "Page Not Found" content at ${pageUrl}`);
        await page.close();
        return { success: true, notFound: true, links: [] };
      }
      
      // Extract all links
      const links = await page.evaluate(() => {
        const results = [];
        const anchors = document.querySelectorAll('a');
        
        for (const anchor of anchors) {
          if (anchor.href) {
            results.push({
              url: anchor.href,
              text: (anchor.innerText || anchor.textContent || '').trim().substring(0, 50)
            });
          }
        }
        
        return results;
      });
      
      // Take screenshot for debugging if requested
      if (debug) {
        await page.screenshot({ path: 'debug-screenshot.png' });
        console.log('Saved debug screenshot to debug-screenshot.png');
      }
      
      if (debug) console.log(`Found ${links.length} links on ${pageUrl}`);
      await page.close();
      
      return { success: true, links: links };
    } catch (error) {
      if (debug) console.error(`Navigation error: ${error.message}`);
      await page.close();
      return { success: false, links: [] };
    }
  } catch (error) {
    if (debug) console.error(`Browser error: ${error.message}`);
    return { success: false, links: [] };
  }
}

// Process a page and find links (hybrid approach)
async function processPage(pageUrl) {
  if (debug) console.log(`\nProcessing page: ${pageUrl}`);
  else process.stdout.write(`Scanning: ${pageUrl.replace(startUrl, '')}\r`);
  
  let links = [];
  let foundLinks = false;
  let isNotFoundPage = false;
  
  // Try Puppeteer first if available
  if (puppeteerAvailable) {
    if (debug) console.log('Using Puppeteer to extract links...');
    const puppeteerResult = await extractLinksWithPuppeteer(pageUrl);
    
    if (puppeteerResult.success) {
      if (puppeteerResult.notFound) {
        isNotFoundPage = true;
      } else {
        links = puppeteerResult.links;
        foundLinks = true;
      }
    } else if (debug) {
      console.log('Puppeteer method failed. Falling back to standard HTTP...');
    }
  }
  
  // If Puppeteer is not available or failed, try standard HTTP
  if (!foundLinks && !isNotFoundPage) {
    try {
      if (debug) console.log('Fetching content using standard HTTP...');
      const response = await axios.get(pageUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 DevSite Link Checker'
        }
      });
      
      // Check if this is a 404 that returns 200
      if (hasPageNotFoundMessage(response.data)) {
        if (debug) console.log(`Page ${pageUrl} contains "Page Not Found" message despite 200 status`);
        isNotFoundPage = true;
      } else {
        // Parse the HTML with cheerio
        const $ = cheerio.load(response.data);
        
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              // Resolve relative URLs
              const absoluteUrl = new URL(href, pageUrl).href;
              links.push({
                url: absoluteUrl,
                text: $(el).text().trim().substring(0, 50) || '[No text]'
              });
            } catch (e) {
              if (debug) console.log(`Error processing URL ${href}: ${e.message}`);
            }
          }
        });
        
        if (links.length > 0) {
          foundLinks = true;
        }
      }
    } catch (error) {
      if (debug) console.error(`Standard HTTP request failed: ${error.message}`);
    }
  }
  
  // Final fallback: try to use curl
  if (!foundLinks && !isNotFoundPage) {
    if (debug) console.log('No links found with standard methods, trying curl fallback...');
    try {
      // Get the page content with curl
      const content = await runCommand(`curl -s "${pageUrl}"`);
      
      if (content) {
        // Use cheerio to parse the HTML
        const $ = cheerio.load(content);
        
        // Find all a tags
        $('a').each((i, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              // Resolve relative URLs
              const absoluteUrl = new URL(href, pageUrl).href;
              links.push({
                url: absoluteUrl,
                text: $(el).text().trim().substring(0, 50) || '[No text]'
              });
            } catch (e) {
              if (debug) console.log(`Error processing URL ${href}: ${e.message}`);
            }
          }
        });
      }
    } catch (error) {
      if (debug) console.error(`Curl fallback failed: ${error.message}`);
    }
  }
  
  // If this is a "Page Not Found" page, skip processing links
  if (isNotFoundPage) {
    if (debug) console.log(`Skipping ${pageUrl} as it appears to be a "Page Not Found" page`);
    return;
  }
  
  if (debug) console.log(`Found ${links.length} links on page ${pageUrl}`);
  
  // Process all the links
  const brokenLinksOnPage = [];
  const newPagesToVisit = [];
  
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    
    // Show progress only in debug mode
    if (debug && (i % 10 === 0 || i === links.length - 1)) {
      const percentage = Math.round((i / links.length) * 100);
      console.log(`Checking link ${i+1}/${links.length} (${percentage}%)`);
    }
    
    // Skip non-HTTP links
    if (!link.url || 
        link.url.startsWith('#') || 
        link.url.startsWith('javascript:') ||
        link.url.startsWith('mailto:') ||
        link.url.startsWith('tel:')) {
      continue;
    }
    
    // Only process links in the same domain
    if (isSameDomain(link.url, startUrl)) {
      try {
        let isBroken = false;
        let reason = '';
        
        // Try Puppeteer first if available
        if (puppeteerAvailable) {
          try {
            if (debug) console.log(`Testing link with Puppeteer: ${link.url}`);
            const puppeteerResult = await extractLinksWithPuppeteer(link.url);
            
            if (puppeteerResult.success) {
              if (puppeteerResult.notFound) {
                isBroken = true;
                reason = 'Page Not Found message in content';
              } else {
                // Valid link - add to queue if not visited
                if (!visitedUrls.has(link.url) && !pageQueue.includes(link.url)) {
                  newPagesToVisit.push(link.url);
                }
              }
            } else {
              // Puppeteer failed, fall back to HTTP
              throw new Error('Puppeteer check failed');
            }
          } catch (e) {
            // Fallback to HTTP check
            if (debug) console.log(`Puppeteer check failed, falling back to HTTP check`);
            
            // Check the link with standard HTTP
            const response = await axios.get(link.url, {
              timeout: 5000,
              validateStatus: status => true, // Accept any status code
              headers: {
                'User-Agent': 'Mozilla/5.0 DevSite Link Checker'
              }
            });
            
            if (response.status !== 200) {
              isBroken = true;
              reason = `HTTP ${response.status}`;
            } else if (hasPageNotFoundMessage(response.data)) {
              isBroken = true;
              reason = 'Page Not Found message in content';
            } else if (!visitedUrls.has(link.url) && !pageQueue.includes(link.url)) {
              newPagesToVisit.push(link.url);
            }
          }
        } else {
          // If Puppeteer is not available, use standard HTTP
          if (debug) console.log(`Testing link with HTTP: ${link.url}`);
          
          const response = await axios.get(link.url, {
            timeout: 5000,
            validateStatus: status => true, // Accept any status code
            headers: {
              'User-Agent': 'Mozilla/5.0 DevSite Link Checker'
            }
          });
          
          if (response.status !== 200) {
            isBroken = true;
            reason = `HTTP ${response.status}`;
          } else if (hasPageNotFoundMessage(response.data)) {
            isBroken = true;
            reason = 'Page Not Found message in content';
          } else if (!visitedUrls.has(link.url) && !pageQueue.includes(link.url)) {
            newPagesToVisit.push(link.url);
          }
        }
        
        // Log and record broken links
        if (isBroken) {
          // Store the broken link for later output
          const brokenLink = {
            url: link.url,
            text: link.text,
            reason: reason,
            sourcePage: pageUrl
          };
          
          // Report immediately only in verbose mode
          if (verbose || debug) {
            console.log(`\nBROKEN LINK on ${pageUrl}`);
            console.log(`  → ${link.url}`);
            console.log(`  → Reason: ${reason}`);
            if (link.text) console.log(`  → Text: "${link.text}"`);
          }
          
          brokenLinksOnPage.push(brokenLink);
        }
      } catch (error) {
        // Store the broken link for later output
        const brokenLink = {
          url: link.url,
          text: link.text,
          reason: `Error: ${error.message}`,
          sourcePage: pageUrl
        };
        
        // Report immediately only in verbose mode
        if (verbose || debug) {
          console.log(`\nBROKEN LINK on ${pageUrl}`);
          console.log(`  → ${link.url}`);
          console.log(`  → Reason: Error: ${error.message}`);
          if (link.text) console.log(`  → Text: "${link.text}"`);
        }
        
        brokenLinksOnPage.push(brokenLink);
      }
    }
  }
  
  // Add new pages to the queue
  for (const url of newPagesToVisit) {
    pageQueue.push(url);
  }
  
  // Save broken links for the page
  if (brokenLinksOnPage.length > 0) {
    brokenLinks[pageUrl] = brokenLinksOnPage;
    
    // Only show summary count in verbose mode
    if (verbose || debug) {
      console.log(`\nFound ${brokenLinksOnPage.length} broken links on ${pageUrl}`);
    } else if (brokenLinksOnPage.length > 0) {
      // In non-verbose mode, just show a dot for each page with broken links
      process.stdout.write('×');
    }
  } else {
    // In non-verbose mode, show a dot for each page without errors
    if (!verbose && !debug) {
      process.stdout.write('.');
    }
  }
}

// Main crawl function
async function crawl() {
  try {
    console.log('Starting website crawler for broken links...');
    console.log(`Start URL: ${startUrl}`);
    
    // Initialize Puppeteer if requested
    if (usePuppeteer) {
      puppeteerAvailable = await initPuppeteer();
    }
    
    const startTime = Date.now();
    let pagesProcessed = 0;
    let lastProgressUpdate = Date.now();
    
    // Main crawl loop
    while (pageQueue.length > 0) {
      const currentUrl = pageQueue.shift();
      pagesProcessed++;
      
      // Show minimal progress updates periodically (every 5 seconds)
      const now = Date.now();
      if (now - lastProgressUpdate > 5000) {
        const elapsedSeconds = (now - startTime) / 1000;
        process.stdout.write(`\rPages: ${pagesProcessed} | Queue: ${pageQueue.length} | Time: ${elapsedSeconds.toFixed(0)}s`);
        lastProgressUpdate = now;
      }
      
      if (!visitedUrls.has(currentUrl)) {
        visitedUrls.add(currentUrl);
        await processPage(currentUrl);
      }
    }
    
    // Final report
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`\n\nSummary:`);
    console.log(`Visited ${visitedUrls.size} unique pages in ${duration.toFixed(1)} seconds`);
    
    if (Object.keys(brokenLinks).length === 0) {
      console.log('No broken links found.');
    } else {
      // Collect all broken links into a flat array
      const allBrokenLinks = [];
      for (const links of Object.values(brokenLinks)) {
        allBrokenLinks.push(...links);
      }
      
      // Sort broken links by source page
      allBrokenLinks.sort((a, b) => a.sourcePage.localeCompare(b.sourcePage));
      
      console.log(`\nFound ${allBrokenLinks.length} broken links on ${Object.keys(brokenLinks).length} pages:\n`);
      
      // Table header
      console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ SOURCE PAGE                   │ BROKEN LINK                    │ REASON     │');
      console.log('├─────────────────────────────────────────────────────────────────────────────┤');
      
      // Table rows
      let lastSourcePage = '';
      allBrokenLinks.forEach(link => {
        // Prepare the data for the columns
        const sourcePage = link.sourcePage === lastSourcePage ? '' : link.sourcePage.replace(startUrl, '');
        lastSourcePage = link.sourcePage;
        
        const brokenUrl = link.url.replace(startUrl, '');
        const reason = link.reason;
        
        // Format and truncate each column
        const col1 = sourcePage.padEnd(30).substring(0, 30);
        const col2 = brokenUrl.padEnd(30).substring(0, 30);
        const col3 = reason.padEnd(12).substring(0, 12);
        
        console.log(`│ ${col1} │ ${col2} │ ${col3} │`);
      });
      
      console.log('└─────────────────────────────────────────────────────────────────────────────┘');
    }
    
  } catch (error) {
    console.error('\nError during crawl:', error);
  } finally {
    // Clean up Puppeteer if used
    if (puppeteerAvailable && browser) {
      if (debug) console.log('Closing browser...');
      await browser.close().catch(e => {});
    }
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\nUncaught exception:', error);
  
  // Clean up Puppeteer if used
  if (puppeteerAvailable && browser) {
    browser.close().catch(e => {}).finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\nUnhandled promise rejection:', reason);
  
  // Clean up Puppeteer if used
  if (puppeteerAvailable && browser) {
    browser.close().catch(e => {}).finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Start the crawl
crawl().catch(error => {
  console.error('\nError during crawl:', error);
  process.exit(1);
});