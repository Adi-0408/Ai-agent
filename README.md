# Echo | AI Agent Workspace Dashboard

A high-performance, responsive, interactive frontend dashboard UI inspired by the three-column AI Agent Composer (Echo) workspace, reimagined in a **Deep Cosmic Indigo & Violet-Cyan** aesthetic.

## Tech Stack
- **Framework:** React 18 + Vite 6
- **Styling:** Tailwind CSS 3.4 + Custom Glassmorphic surfaces & Ambient Radial Mesh Gradients
- **Icons:** Lucide React
- **Typography:** Inter & JetBrains Mono

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The application runs at `http://localhost:3000/`.

## Key Features & Interactions
1. **Three-Column Layout (`100vh`, `overflow-hidden`):**
   - **Left Primary Navigation (240px, collapsible):** Brand logo, user workspace switcher, `⌘ K` search bar, primary Composer link, categorized BUILD/TEST/OBSERVE navigation, and sticky credits card.
   - **Middle Threads Drawer (280px, collapsible):** Thread list with empty state, dynamic thread generation, and thread deletion.
   - **Main Composer Workspace (`flex-1`):** Sub-header with drawer toggles, glowing 72x72px orbital emblem, greeting, 2x2 interactive Bento grid, and floating prompt composer.
2. **Interactive States:**
   - Command palette modal (`⌘ K` / `Ctrl + K`)
   - Buy credits top-up modal
   - Call recording access-control migration guide
   - Live simulated chat thread responses with latency metrics, architecture blueprints, and code snippets
   - View switching between Composer, Assistants, Tools, and Live Logs
