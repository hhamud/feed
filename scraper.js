// scraper.js
import fs from 'fs/promises';
import path from 'path';
import { Feed } from 'feed';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { parse } from 'yaml';

async function loadConfig() {
  const configFile = await fs.readFile('config.yml', 'utf8');
  return parse(configFile);
}

async function scrapeWebsite(site) {
  try {
    const response = await fetch(site.url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const items = [];

    for (const element of $(site.selector).toArray()) {
      const title = $(element).find(site.titleSelector).text().trim();
      const link = new URL(
        $(element).find(site.linkSelector).attr('href'),
        site.url
      ).toString();

      // Fetch the content from the link URL
      let content = '';
      try {
        const contentResponse = await fetch(link);
        const contentHtml = await contentResponse.text();
        const $content = cheerio.load(contentHtml);
        content = $content(site.contentSelector).html();
        console.log(content);
      } catch (contentError) {
        console.error(`Error fetching content from ${link}:`, contentError);
      }

      const dateStr = $(element).find(site.dateSelector).text().trim();
      const date = new Date(dateStr);

      items.push({
        title,
        link,
        content,
        date: isNaN(date.getTime()) ? new Date() : date
      });
    }

    return items;
  } catch (error) {
    console.error(`Error scraping ${site.url}:`, error);
    return [];
  }
}

async function generateFeed(site, items) {
  const feed = new Feed({
    title: site.name,
    description: `RSS feed for ${site.name}`,
    id: site.url,
    link: site.url,
    language: "en",
    updated: new Date(),
    generator: "RSS Generator"
  });

  items.forEach(item => {
    feed.addItem({
      title: item.title,
      id: item.link,
      link: item.link,
      content: item.content,
      date: item.date
    });
  });

  return {
    rss: feed.rss2(),
    atom: feed.atom1(),
    json: feed.json1()
  };
}

async function main() {
  try {
    const config = await loadConfig();
    await fs.mkdir(config.outputDir, { recursive: true });

    for (const site of config.sites) {
      console.log(`Processing ${site.name}...`);
      const items = await scrapeWebsite(site);
      const feeds = await generateFeed(site, items);

      const safeName = site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await fs.writeFile(path.join(config.outputDir, `${safeName}.xml`), feeds.rss);
      await fs.writeFile(path.join(config.outputDir, `${safeName}.atom`), feeds.atom);
      await fs.writeFile(path.join(config.outputDir, `${safeName}.json`), feeds.json);
    }

    // Generate index.html
    const siteList = config.sites
      .map(site => {
        const safeName = site.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return `
          <div class="site-feeds">
            <h2>${site.name}</h2>
            <ul>
              <li><a href="${safeName}.xml">RSS Feed</a></li>
              <li><a href="${safeName}.atom">Atom Feed</a></li>
              <li><a href="${safeName}.json">JSON Feed</a></li>
            </ul>
          </div>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>RSS Feeds</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 2rem; }
            .site-feeds { margin-bottom: 2rem; }
            ul { list-style-type: none; padding: 0; }
            li { margin: 0.5rem 0; }
            a { color: #0066cc; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>Available RSS Feeds</h1>
          ${siteList}
        </body>
      </html>
    `;

    await fs.writeFile(path.join(config.outputDir, 'index.html'), html);
    console.log('Successfully generated all feeds!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
