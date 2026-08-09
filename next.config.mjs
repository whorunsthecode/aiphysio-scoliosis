/** @type {import('next').NextConfig} */

// Security headers. A health app that leaks its pages into a third-party frame
// or lets a referrer carry a session URL onward has a privacy problem before
// any of its own code runs.
const securityHeaders = [
  // The app is never legitimately framed. Blocking it outright removes
  // clickjacking as a route to a signed-in session.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send no referrer off-origin. URLs in this app identify pages a person
  // visited about their own spine; that is not something to hand to whatever
  // they click next.
  { key: "Referrer-Policy", value: "no-referrer" },
  // Camera and motion sensors are core to the product, so they stay — for this
  // origin only. Everything else the browser would otherwise allow is denied,
  // because an app holding health data has no business asking for location,
  // a microphone, or payment.
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "accelerometer=(self)",
      "gyroscope=(self)",
      "magnetometer=(self)",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  // HTTPS only, including subdomains. Health data must never traverse a
  // downgraded connection.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Next sets this by default; being explicit keeps the server from
  // advertising its own version to anyone probing.
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Anything carrying personal data must not be cached by an
        // intermediary or left in a shared browser cache.
        source: "/api/privacy/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, private" },
        ],
      },
    ];
  },
};

export default nextConfig;
