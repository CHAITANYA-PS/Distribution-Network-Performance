# Dsphere Distributor Operations Management Platform

Open `index.html` in Chrome or Edge. Each feature is provided as a separate HTML page while all pages share `style.css`, `app.js`, the original logo, and the same Local Storage dataset.

## Feature pages
- `index.html` - Dashboard Overview
- `distributor-network.html` - Distributor Network
- `sales-performance.html` - Sales Performance
- `distributor-health.html` - Distributor Health
- `recommendation-center.html` - Recommendation Center
- `returns-recovery.html` - Returns & Recovery
- `carbon-compliance.html` - Carbon Compliance
- `reports-analytics.html` - Reports & Analytics
- `alerts-notifications.html` - Alerts & Notifications

## Palette
Coffee Brown `#8B5A3C`, Dark Brown `#6D442A`, Light Brown `#B88A63`, Accent `#C79A70`, Sand Beige `#F0E8DA`, Warm Ivory `#F5F2EC`, White `#FFFFFF`, Dark Navy `#1D3557`, Secondary Text `#6B7280`, Border `#E5DED3`, Success `#16A34A`.


## Navigation
The left navigation is hidden by default inside the burger menu. Select the burger icon in the header to open it. Select the overlay, a navigation link, or press Escape to close it.


## Header layout
The Dsphere logo is displayed inside the main top ribbon alongside the search bar. The burger menu is positioned in a separate slim ribbon directly below the search ribbon.


## Left navigation
The burger menu has been removed. The complete navigation bar is permanently visible on the left on desktop and tablet layouts. On narrow mobile screens, the navigation appears above the page content.

## Final header and navigation layout
The logo, application name, search bar, notifications, and profile are contained in one full-width header ribbon. The visible left navigation starts directly below the header ribbon and never overlaps the header.


## JavaScript validation
`validation.js` validates all dynamically generated forms before `app.js` saves data. It checks required fields, health-score range, positive amounts and targets, text lengths, and valid distributor names. Invalid fields receive accessible inline messages and focus.
