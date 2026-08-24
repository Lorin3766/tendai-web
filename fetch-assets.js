// fetch-assets.js
//
// Automated downloader for winter urban weather images.
// Downloads a fixed set of high-quality Unsplash images into:
//   mobile-app/assets/weather/usa/urban/winter/
//
// Usage (from project root):
//   node fetch-assets.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// Target directory for the new weather engine
const TARGET_DIR = path.join(
  __dirname,
  'mobile-app',
  'assets',
  'weather',
  'usa',
  'urban',
  'winter'
);

// Hand-picked winter urban/suburban photos (Unsplash)
// Each URL is the official Unsplash download endpoint and will redirect
// to the underlying images.unsplash.com asset.
const assets = [
  {
    filename: 'day_clear.jpg',
    // Winter urban city with snow on the ground (daytime)
    page: 'https://unsplash.com/photos/a-view-of-a-city-with-snow-on-the-ground-EcgsYhnJhyk',
    url: 'https://unsplash.com/photos/EcgsYhnJhyk/download?force=true',
  },
  {
    filename: 'day_clouds.jpg',
    // Suburban snowy street with houses and street light (more overcast)
    page: 'https://unsplash.com/photos/a-snowy-street-with-houses-and-a-street-light-3zc-i79Fw04',
    url: 'https://unsplash.com/photos/3zc-i79Fw04/download?force=true',
  },
  {
    filename: 'night_clear.jpg',
    // Winter city street at night with snow on the ground
    page: 'https://unsplash.com/photos/a-city-street-at-night-with-snow-on-the-ground-VtDboa0ZzkY',
    url: 'https://unsplash.com/photos/VtDboa0ZzkY/download?force=true',
  },
  {
    filename: 'night_clouds.jpg',
    // Snowy Chicago street at night, more atmospheric/cloudy
    page: 'https://unsplash.com/photos/people-walk-down-a-snowy-chicago-street-at-night-lGf7FsJb68U',
    url: 'https://unsplash.com/photos/lGf7FsJb68U/download?force=true',
  },
  {
    filename: 'golden_hour_clear.jpg',
    // House with a lot of snow on the ground, warm light suitable for golden hour
    page: 'https://unsplash.com/photos/a-house-with-a-lot-of-snow-on-the-ground-plQ7U5Hhplk',
    url: 'https://unsplash.com/photos/plQ7U5Hhplk/download?force=true',
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function downloadFile(fileUrl, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const performRequest = (currentUrl, redirectsLeft) => {
      const options = url.parse(currentUrl);

      https
        .get(options, (res) => {
          // Follow redirects from Unsplash download URLs
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            if (redirectsLeft <= 0) {
              res.resume();
              return reject(
                new Error(`Too many redirects while fetching ${currentUrl}`)
              );
            }
            const nextUrl = url.resolve(currentUrl, res.headers.location);
            return performRequest(nextUrl, redirectsLeft - 1);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(
              new Error(
                `Request for ${currentUrl} failed with status ${res.statusCode}`
              )
            );
          }

          const fileStream = fs.createWriteStream(destPath);
          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => resolve());
          });

          fileStream.on('error', (err) => {
            fileStream.close(() => {
              fs.unlink(destPath, () => reject(err));
            });
          });
        })
        .on('error', (err) => reject(err));
    };

    performRequest(fileUrl, maxRedirects);
  });
}

async function main() {
  console.log(`Target directory: ${TARGET_DIR}`);
  ensureDir(TARGET_DIR);

  for (const asset of assets) {
    const dest = path.join(TARGET_DIR, asset.filename);
    console.log(
      `\n[WEATHER FETCH] ${asset.filename}\n  Page: ${asset.page}\n  URL:  ${asset.url}`
    );
    try {
      await downloadFile(asset.url, dest);
      console.log(`  ✔ Saved to ${path.relative(__dirname, dest)}`);
    } catch (err) {
      console.error(`  ✖ Failed to download ${asset.filename}: ${err.message}`);
    }
  }

  console.log('\nDone fetching winter urban weather assets.');
}

main().catch((err) => {
  console.error('Fatal error in fetch-assets.js:', err);
  process.exit(1);
});

