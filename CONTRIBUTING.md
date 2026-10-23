# Contributing

Thanks for helping. Bug reports, new worlds, themes and fixes are all welcome.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, the API runs too
npm test           # unit tests
```

No accounts or keys are needed to work on the heatmaps. `.env.example` lists the optional settings (GitHub token, database for analytics, Clerk for the admin page).

## Before a pull request

- Keep changes focused: one fix or feature per PR.
- Run `npm test` and `npm run build`.
- For visual changes, add a screenshot or a short clip.
- For anything that touches the API, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): every heatmap shares one cached copy of each user's data, and that must stay true.

## Where things live

See the project layout in the [README](README.md#project-layout). A new world goes in `src/lib/styles/` and is registered in `src/lib/styles/index.js`.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. For API problems, include the `X-Request-Id` response header: it lets us find the exact request in the logs.
