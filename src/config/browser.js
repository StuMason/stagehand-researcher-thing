// src/config/browser.js
export const browserConfig = {
    // Launch arguments for Chrome
    launchArgs: [
      // Security & Privacy
      '--disable-extensions',
      '--disable-notifications',
      '--disable-geolocation',
      '--disable-media-stream',
      '--disable-speech-api',
      '--disable-permissions-api',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
  
      // Performance & Memory
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-threaded-animation',
      '--disable-threaded-scrolling',
      '--disable-composited-antialiasing',
      
      // Automation & Research
      '--disable-blink-features=AutomationControlled',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--disable-popup-blocking',
      '--window-size=1920,1080',
      '--force-device-scale-factor=1',
      
      // Network
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-experiments',
      '--no-pings'
    ],
  
    // Context level configuration
    contextOptions: {
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      viewport: {
        width: 1920,
        height: 1080
      },
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      offline: false,
      acceptDownloads: true,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
      }
    },
  
    // Resource control - block unnecessary requests
    blockedResources: [
      '*.doubleclick.net',
      '*.google-analytics.com',
      '*.facebook.com',
      '*.googletagmanager.com',
      '*.hotjar.com',
      '*.linkedin.com/pixel',
      '*.googlesyndication.com',
      '*.quantserve.com',
      '*.stripe.com',
      '*.intercomcdn.com',
      '*.optimizely.com',
      '*.analytics',
      '*.tracking',
      '*.adnxs.com',
      '*/ads/*',
      '*/analytics/*',
      '*/tracking/*'
    ],
  
    // Emulate specific geolocation if needed
    geolocation: {
      latitude: 40.7128,
      longitude: -74.0060,
      accuracy: 100
    },
  
    // Network conditions
    networkConditions: {
      offline: false,
      latency: 20,
      downloadThroughput: 10 * 1024 * 1024, // 10 Mbps
      uploadThroughput: 5 * 1024 * 1024     // 5 Mbps
    },
  
    // Memory
    processArguments: {
      js_flags: [
        '--max-old-space-size=4096',        // Increase memory limit
        '--expose-gc',                      // Enable manual garbage collection
        '--max_semi_space_size=64'          // Control semi-space size
      ]
    }
  };