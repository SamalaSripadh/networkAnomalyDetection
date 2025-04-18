const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Utility function for delays (Add pauses between actions)
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to scrape bank offers using Puppeteer
async function getBankOffers(url) {
    try {
        // Launch browser in headless mode
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Set a realistic user agent (to avoid verification page)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.evaluateOnNewDocument(() => {
            delete navigator.__proto__.webdriver;
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1000);
        
        // Check if we're on a verification page
        const isVerificationPage = await page.evaluate(() => {
            return document.title.includes('Robot Check') || 
                   document.body.innerText.includes('Enter the characters you see below') ||
                   document.body.innerText.includes('Type the characters you see in this image');
        });
        
        if (isVerificationPage) {
            await browser.close();
            return { error: 'Verification page detected. Please try again later.' };
        }

        const offerLinkSelectors = [
            '.a-size-base.a-link-emphasis.vsx-offers-count',
            '#vsx-offers-count-link',
            'a[href*="bank-offers"]',
            'a[href*="offers"]',
            'span[data-csa-c-content-id="creditCard"]',
            '.a-link-normal[href*="credit"]'
        ];

        let offerLinkFound = false;
        for (const selector of offerLinkSelectors) {
            try {
                const linkExists = await page.$(selector) !== null;
                if (linkExists) {
                    offerLinkFound = true;
                    await page.click(selector);
                    await delay(1000);
                    break;
                }
            } catch (error) {
                // Continue to next selector
            }
        }

        // If no link found with selectors, try to find by text content
        if (!offerLinkFound) {
            const offerLinkByText = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a, span[role="button"], div[role="button"]'));
                for (const link of links) {
                    const text = link.textContent.toLowerCase();
                    if (text.includes('offer') || text.includes('bank') || text.includes('emi')) {
                        return link;
                    }
                }
                return null;
            });
            
            if (offerLinkByText) {
                await page.evaluate(link => link.click(), offerLinkByText);
                offerLinkFound = true;
                await delay(1000);
            } else {
                await browser.close();
                return { error: 'No bank offers found for this product.' };
            }
        }

        // Wait for popup to appear
        const popupSelectors = [
            '.vsx-offers-desktop-lv__list',
            '.vsx-offers-desktop-lv__item',
            '[data-testid="bank-offers-popup"]',
            '.a-box-inner',
            '#credit-and-payment-accordion'
        ];
        
        let popupFound = false;
        for (const selector of popupSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                popupFound = true;
                break;
            } catch (e) {
                // Continue to next selector
            }
        }
        
        if (!popupFound) {
            await browser.close();
            return { error: 'No offers popup found.' };
        }

        const offers = await page.evaluate(() => {
            const results = [];
            const seenOffers = new Set(); // Track without duplicates
            
            const offerItemSelectors = [
                '.vsx-offers-desktop-lv__list .vsx-offers-desktop-lv__item',
                '.vsx-offers-desktop-lv__item',
                '[data-testid="bank-offer-item"]',
                '.a-box-inner',
                '#credit-and-payment-accordion .a-box'
            ];
            
            for (const selector of offerItemSelectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    items.forEach(item => {
                        const offerTitle = item.querySelector('.a-size-base-plus.a-spacing-mini.a-spacing-top-small.a-text-bold')?.textContent.trim() || 
                                          item.querySelector('.a-text-bold')?.textContent.trim() ||
                                          'Offer';
                        
                        // Get the text content and ignoring "See details" and similar text
                        let offerText = item.textContent.trim().replace(/\\s+/g, ' ');
                        offerText = offerText.replace(/See details/g, '').trim();
                        offerText = offerText.replace(/See more/g, '').trim();
                        offerText = offerText.replace(/See less/g, '').trim();
                        
                        if (offerText.startsWith(offerTitle)) {
                            offerText = offerText.substring(offerTitle.length).trim();
                        }
                        
                        const offerKey = `${offerTitle}:${offerText}`;
                        
                        if (offerText && !seenOffers.has(offerKey)) {
                            seenOffers.add(offerKey);
                            results.push({
                                title: offerTitle,
                                fullText: offerText
                            });
                        }
                    });
                    
                    if (results.length > 0) break;
                }
            }

            return results;
        });

        await browser.close();
        return { offers };
    } catch (error) {
        return { error: error.message };
    }
}

// Function to save data to JSON file
function saveToJson(data, productName) {
    try {
        const outputDir = path.join(process.cwd(), 'scraped_data');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedProductName = productName
            .replace(/[^a-zA-Z0-9]/g, '_') 
            .substring(0, 50); // Limit length to avoid too long filenames
        
        const filename = `${sanitizedProductName}_${timestamp}.json`;
        const filePath = path.join(outputDir, filename);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`\nData saved to: ${filePath}`);
        return true;
    } catch (error) {
        console.error(`Error saving data: ${error.message}`);
        return false;
    }
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\u200E\u200F\u200B]/g, '') // Remove LTR, RTL, and zero-width space
        .trim();
}

// Function to scrape basic product information (other than bank offers)
async function scrapeAmazonProduct(url) {
  try {
    console.log('Scraping data from Amazon...');
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    };

    const { data } = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(data);

    const productName = cleanText($('#productTitle').text());

    const rating = cleanText($('#acrPopover .a-icon-alt').first().text());

    const numberOfRatings = cleanText($('#acrCustomerReviewText').text().replace(/ratings.*$/, 'ratings'));

    const sellingPrice = cleanText($('.a-price-whole').first().text());
    const mrp = cleanText($('.a-text-price .a-offscreen').first().text());

    const totalDiscount = cleanText($('.savingsPercentage').first().text().replace('-', ''));

    const aboutThisItem = {};
    $('#feature-bullets ul li').each((i, elem) => {
      const bulletPoint = cleanText($(elem).text());
      if (!bulletPoint.includes('See more product details')) {
        const colonIndex = bulletPoint.indexOf(':');
        if (colonIndex !== -1) {
          const key = bulletPoint.substring(0, colonIndex).trim();
          const value = bulletPoint.substring(colonIndex + 1).trim();
          aboutThisItem[key] = value;
        } else {
          aboutThisItem[`Feature ${i + 1}`] = bulletPoint;
        }
      }
    });

    const productInfo = {};
    $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each((i, row) => {
      const label = cleanText($(row).find('th').text());
      const value = cleanText($(row).find('td').text());
      if (label && value && 
          !label.includes('ASIN') && 
          !label.includes('Customer Reviews')) {
        productInfo[label] = value.replace(/\s+/g, ' ').trim();
      }
    });

    const productImages = new Set();
    $('#altImages img').each((i, img) => {
      const imgSrc = $(img).attr('src');
      if (imgSrc && 
          !imgSrc.includes('video') && 
          !imgSrc.includes('play-icon') && 
          !imgSrc.includes('player') &&
          !imgSrc.includes('sprite') &&
          !imgSrc.includes('transparent-pixel') &&
          !imgSrc.includes('grey-pixel')) {
        const highResUrl = imgSrc
          .replace(/_S[XY]\d+_|_\d+x\d+_|_AA\d+_|_SL\d+_|_SS\d+_/g, '_SL1500_')
          .replace(/\._V\d+_/, ''); // Remove version numbers
        productImages.add(highResUrl);
      }
    });

    const manufacturerImages = new Set();
    $('#aplus-module-wrapper img, #aplus img').each((i, img) => {
      const imgSrc = $(img).attr('src');
      if (imgSrc && 
          !imgSrc.includes('video') && 
          !imgSrc.includes('transparent-pixel') && 
          !imgSrc.includes('grey-pixel') &&
          !imgSrc.includes('player') &&
          !imgSrc.includes('sprite')) {
        const highResUrl = imgSrc
          .replace(/_S[XY]\d+_|_\d+x\d+_|_AA\d+_|_SL\d+_|_SS\d+_/g, '_SL1500_')
          .replace(/\._V\d+_/, ''); // Remove version numbers
        manufacturerImages.add(highResUrl);
      }
    });

    let aiSummary = '';
    $('.a-section').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('Customers say') && text.includes('AI-generated from the text of customer reviews')) {
        const fullText = text.split('AI-generated')[0].replace('Customers say', '').trim();
        if (fullText) {
          aiSummary = fullText;
        }
      }
    });

    // Get bank offers using the puppeteer function
    const bankOffersResult = await getBankOffers(url);
    const bankOffers = bankOffersResult.error ? [] : bankOffersResult.offers;

    // Prepare data for JSON export
    const exportData = {
      productName,
      rating,
      numberOfRatings,
      sellingPrice,
      mrp,
      totalDiscount,
      bankOffers,
      aboutThisItem,
      productInfo,
      productImages: Array.from(productImages),
      manufacturerImages: Array.from(manufacturerImages),
      aiSummary,
      url,
      scrapedAt: new Date().toISOString()
    };

    saveToJson(exportData, productName);
    
    console.log('Scraping completed successfully!');
    return exportData;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw new Error(`Failed to scrape product: ${error.message}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

//  input
rl.question('Enter the Amazon product URL: ', async (url) => {
  try {
    await scrapeAmazonProduct(url);
  } catch (error) {
    console.error('Error:', error.message);
  }
  rl.close();
}); 