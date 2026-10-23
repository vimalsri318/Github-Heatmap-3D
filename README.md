# GitHub Heatmap 3D

Turn any GitHub contribution graph into an interactive, 360° rotatable 3D model, then put it on your website or your GitHub README.

Free and open source (MIT). Every world, the song, embeds, animated README images and STL export work for everyone, with no account.

Every day is a bar whose height matches that day's contribution count.

## Styles

| Style | What it shows |
|---|---|
| **City** | One bar per day, as tall as that day's contributions. 8 color themes. |
| **Night City** | A city block for every day, after dark: apartments, office blocks and glass towers with spires, as tall as the day's contributions, with lit window grids, street lamps, moving car lights and parks on empty days. |
| **Galaxy** | A realistic four-armed spiral galaxy (≈90k particles, dust lanes, nebulae, twinkling starfield) from January at the core to December at the rim. Every day is a star colored like a real one, from red dwarf to blue giant; the twelve biggest days are planets (gas giants, rocky, ocean and ice worlds, the top three ringed). |
| **Forest** | An island with a realistic tree for every day: oak, ash, aspen and pine, as tall as the day's contributions, with bushes for quiet days. Four leaf palettes: Spring (greens with pink blossoms on the busiest days), Autumn, Sakura and Dream. |

## 2D designs

Prefer flat? The same year as clean cards that work as GitHub README images and follow the color theme: **Stats card**, **Weekly rhythm** (donut chart), **Monthly bars** and the **Classic grid**. Use `type=card|donut|months|calendar` on the image API.

## Your year as a song

Every profile gets its own song, composed from its contributions. The key, scale and chords come from the username, the tempo from how much was shipped, and every day is one note: busy days play melody and drums, quiet stretches drift into soft pads. Play it on the site while the 3D view follows along, or download it as a WAV file.

## Features

- Any public GitHub user, any year from 2008
- Full 360° orbit: drag to rotate, scroll to zoom, right-drag to pan
- 8 themes: Sand, Ocean, GitHub Dark, GitHub Light, Sunset, Forest, Neon, Halloween
- Customize everything: bar size, height, log scale, shadows, base, labels, rotation speed and direction, saved camera angle, transparent background
- Embed it anywhere: iframe, one-line script tag, or a README image
- Export an STL file for 3D printing

## Use it

The site has a landing page (`/`) that shows everything off, and the **Studio** (`/studio.html`) where you make your own. In the Studio, enter your username, then click **Customize & Embed**. Adjust the settings, rotate the model to the angle you like and click **Save this view**. Then copy the code for:

| Where | What you get |
|---|---|
| **Website** (iframe) | Fully interactive 3D |
| **Script** tag | Fully interactive 3D; options are editable `data-*` attributes |
| **README** | An animated 3D-style image (GitHub READMEs can't run scripts, so the animation lives inside the SVG) that links to the interactive version |
| **Link** | A shareable link to your exact view |

### Website

```html
<iframe src="https://YOUR-SITE/embed.html?user=octocat&theme=ocean"
  style="width: 100%; height: 420px; border: 0" loading="lazy"></iframe>
```

### Script tag

```html
<div data-github-heatmap-3d data-user="octocat" data-theme="sunset" data-transparent="1"
  style="width: 100%; height: 420px"></div>
<script src="https://YOUR-SITE/embed.js" async></script>
```

### GitHub README

```md
[![My contributions in 3D](https://YOUR-SITE/api/heatmap?user=octocat&theme=sand&animate=grow)](https://YOUR-SITE/?user=octocat)
```

`animate=grow` makes the bars rise in a wave from January to December, then a soft light sweeps across them. `animate=loop` rises, holds and falls on repeat. Leave it out for a still image. The animation is SVG's own (SMIL), so it plays in any `<img>`: GitHub, GitLab, Notion, docs sites.

## Options

The same names work as URL params (`?autoRotate=0`), script attributes (`data-auto-rotate="0"`) and image API params. Booleans take `1` / `0`.

| Option | Default | Description |
|---|---|---|
| `user` | – | GitHub username (sample data when empty) |
| `animate` | `0` | README image only: `grow` (rise once), `loop` (rise and fall on repeat), `0` (still) |
| `demo` | `0` | Show the built-in demo year (every month filled) instead of fetching `user` |
| `year` | current year | 2008 to now |
| `style` | `city` | `city`, `night`, `galaxy`, `forest` |
| `palette` | `spring` | Forest leaf colors: `spring`, `autumn`, `sakura`, `dream` |
| `theme` | `sand` | City colors: `sand`, `ocean`, `github`, `github-light`, `sunset`, `forest`, `neon`, `halloween` |
| `height` | `8` | Height of the tallest bar (2–20) |
| `log` | `0` | Log scale, so quiet days stay visible next to busy ones |
| `barSize` | `0.82` | Bar footprint, 0.3–1 (1 = no gaps) |
| `shadows` | `1` | Shadows |
| `base` | `1` | The base under the grid |
| `labels` | `1` | Month and weekday labels |
| `title` | `1` | Username and year (plus total on the image) |
| `transparent` | `0` | No background, to blend into any page |
| `autoRotate` | `1` | Spin automatically |
| `rotateSpeed` | `0.8` | -5 to 5; negative spins clockwise |
| `interactive` | `1` | Drag to rotate |
| `zoom` | `1` | Scroll to zoom |
| `tooltip` | `1` | Show date and count on hover |
| `camera` | – | Starting camera position `x,y,z` (set by **Save this view**) |
| `badge` | `1` | Small "Open in 3D" link on embeds |
| `music` | `0` | "Play your year" song button on embeds |
| `type` | `3d` | Image only: `3d`, or a 2D design: `card`, `donut`, `months`, `calendar` |
| `angle` | `-20` | Image only: view angle around the board, in degrees |
| `tilt` | `30` | Image only: view angle above the board, 5–85 degrees |

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` for the landing page or `/studio.html` for the Studio. The README image API runs at `/api/heatmap` in dev too.

## Deploy

Pushes run tests and a build; merging to `main` migrates the database and deploys to production, then smoke-tests the live site. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

For your own copy: built for [Vercel](https://vercel.com), import the repo and deploy. The static site goes to the CDN and `api/heatmap.js` becomes a serverless function. If the site is served from a different public URL than the one users visit, set `VITE_SITE_URL` so the copied snippets point to it.

## Project layout

```
index.html, src/landing.*   landing page: hero, style showcase, song, designs
studio.html, src/main.js    the Studio: editor + embed code generator
embed.html, src/embed.js    bare 3D view for iframes
public/embed.js             script-tag loader (creates the iframe)
api/heatmap.js              README image endpoint (SVG)
api/contributions.js        contribution data for the 3D views (cached, see docs/ARCHITECTURE.md)
api/track.js, admin.html    anonymous analytics and the admin page
api/_observe.js             request logs, traces and API metrics
docs/ARCHITECTURE.md        how requests flow, caching, failure handling, capacity
src/lib/heatmap.js          the 3D component: createHeatmap(element, options)
src/lib/styles/             City, Night City, Galaxy, Forest
src/lib/song.js             song composer, player and WAV export
src/lib/svg.js              3D-style SVG renderer for images
src/lib/charts.js           2D designs: stats card, donut, monthly bars, classic grid
src/lib/options.js          every option, its default and URL format
src/lib/themes.js           color themes
src/lib/data.js             contribution data + stats
```

## Data

Contributions come from GitHub's GraphQL API when `GITHUB_TOKEN` is set, with the public [github-contributions-api](https://github.com/grubersjoe/github-contributions-api) as backup (and as the only source without a token). Private contributions only appear if the user has turned on "Include private contributions" on their GitHub profile.

Built with [Three.js](https://threejs.org) and [Vite](https://vite.dev). Forest trees are generated with [EZ-Tree](https://github.com/dgreenheck/ez-tree) by Daniel Greenheck (MIT); its bark textures come from [Poly Haven](https://polyhaven.com) and [TextureCan](https://www.texturecan.com) (CC0).

## How it stays up under load

Every heatmap (README image, iframe, script embed, Studio) gets its data from `/api/contributions`, never straight from GitHub. One user's year is fetched once and shared:

1. **CDN / GitHub's image proxy** cache the finished response (an hour for this year, a week for past years, and stale copies keep being served while they refresh).
2. **Instance memory**, then **Vercel Runtime Cache** shared by all instances.
3. Only then **GitHub**: the official GraphQL API when `GITHUB_TOKEN` is set, with the public scraper as backup. However many requests ask at once, it's one fetch per user and year.

If GitHub is down or rate limited, the last copy is served instead of an error. Unknown usernames are rejected or remembered, and each visitor gets 30 uncached lookups a minute (cached ones are unlimited). For a hard global limit, add a Vercel Firewall rate-limit rule on `/api/*`.

```bash
npm test                                             # unit tests (animation + caching)
npm run load-test -- https://YOUR-SITE --requests 1000 --concurrency 100
```

## Analytics and the admin page

`/admin.html` shows how the app is doing: visitors per day, page views, the journey from first visit to copied code, where visits come from, which websites embed it, the most clicked buttons, which GitHub users are shown, README image renders, countries, devices, new accounts, revenue and a live feed.

- **Who can see it:** Google accounts whose verified email is listed in `ADMIN_EMAILS`.
- **What's tracked:** page views and every click on a link or button (automatically), plus named actions: `load_user`, `copy_code`, `embed_view`, `paywall_open`, `export_stl`, `start_build`. Add your own with `track('name', { … })` from `src/lib/track.js`.
- **Privacy:** no cookies and nothing personal stored. A visitor is a daily hash of IP + browser + a server secret, so the same person counts once a day and can't be followed across days. Bots are skipped. That's why no consent banner is needed.
- **README images** are counted as renders, not views: GitHub's image proxy and the CDN answer most views without reaching us.

Setup: run `npm run db:migrate` (adds the `events` and `daily_counts` tables) and set `ADMIN_EMAILS` in Vercel.

```bash
TEST_DATABASE_URL=postgresql://localhost/heatmap_test npm test   # also runs the analytics tests (throwaway database only)
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
