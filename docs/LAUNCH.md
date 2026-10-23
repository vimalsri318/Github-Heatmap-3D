# Launch kit

Drafts for announcing GitHub Heatmap 3D. Edit them into your own voice before posting; posts that sound personal do much better than polished ones.

- Site: https://heatmap3d.thoughtlatch.com
- Code: https://github.com/vimalsri318/Github-Heatmap-3D
- Add `?utm_source=<site>` to links (for example `?utm_source=linkedin`) so the admin page's **Campaigns** list shows which post brought people in.

## Before posting

- [ ] Production checklist in [ARCHITECTURE.md](ARCHITECTURE.md#before-launch) done (`GITHUB_TOKEN`, firewall rule, `npm run db:migrate`, `ADMIN_EMAILS`)
- [ ] Your own README shows the animated image (people will check)
- [ ] A 10–20 second screen recording: type a username, the bars rise, switch to Galaxy and Forest, copy the README code
- [ ] 3–4 screenshots: City, Night City, Galaxy, Forest, plus the animated README on a real GitHub profile
- [ ] The GitHub repo has a description, topics (`github`, `threejs`, `3d`, `readme`, `contributions`, `visualization`) and a social preview image (Settings → Social preview)
- [ ] Space posts a day or two apart, and stay around for the first hour of each to answer comments

## LinkedIn

> I turned my GitHub contribution graph into a 3D city. 🏙️
>
> Every day is a building, as tall as what I shipped that day. You can spin it, switch it to a night city, a galaxy or a forest, hear your year as a song, and put it on your website or GitHub README. The README version is an animated SVG, so the bars rise right on your profile with no GIF or script.
>
> It's free and open source. Try it with your username:
> https://heatmap3d.thoughtlatch.com?utm_source=linkedin
>
> Built with Three.js and Vercel Functions. The part I enjoyed most was making it hold up under traffic: however many people view a profile, GitHub is asked at most once an hour.
>
> Code: https://github.com/vimalsri318/Github-Heatmap-3D
>
> #opensource #github #threejs #webdev #javascript

Attach the screen recording (native video gets far more reach than links). Put the link in the post, not only in a comment.

## Reddit

Each subreddit has its own self-promotion rules; read them first. Post as yourself, lead with what it does, and answer every comment.

**r/SideProject** · title: `I made a tool that turns your GitHub contributions into a 3D city you can embed in your README`

> Type your GitHub username and your year becomes a 3D city, one building per day. There are also Night City, Galaxy and Forest versions, and it can play your year as a song.
>
> You can embed it on a website (iframe or script tag) or put it in your GitHub README. GitHub READMEs can't run scripts, so the README version is an SVG with the animation built in: the bars rise in a wave from January to December.
>
> Free, no sign-up, open source (MIT): https://heatmap3d.thoughtlatch.com?utm_source=reddit
>
> Code: https://github.com/vimalsri318/Github-Heatmap-3D
>
> I'd love feedback on which world people like most, and what you'd add.

**r/webdev** (Showoff Saturday only) · title: `[Showoff Saturday] Your GitHub contribution graph as a 3D city, with an animated SVG for READMEs`

Lead with the technical part: animated SVG inside an `<img>` (SMIL + per-bar clip paths, ~90 KB), a shared cache so one GitHub call an hour per user, Three.js for the 3D.

**r/threejs** · title: `Turning a year of GitHub contributions into a city, a galaxy and a forest (Three.js)`

Focus on the scenes: 90k-particle galaxy, procedural trees (EZ-Tree), night city lighting with bloom. Link the repo first.

**r/github** and **r/opensource**: short version of the r/SideProject post. Check each sub's rules on tools first.

## Hacker News

Title: `Show HN: Your GitHub contribution graph as a 3D city, embeddable in READMEs`

Link to the site. Then add a first comment yourself:

> I built this to make my GitHub profile a bit more fun. A few details that might interest people here:
>
> - The README image is an animated SVG. GitHub's image proxy won't run scripts, so each bar is clipped to its own outline and slides up from under the board with SMIL. One `animateTransform` per bar keeps it around 90 KB.
> - Data is cached in layers (CDN, instance memory, Vercel Runtime Cache), and concurrent requests for the same user share one fetch, so a profile costs at most one GitHub API call an hour however many people view it.
> - Analytics are cookieless: a daily hash of IP + browser + secret, like Plausible.
>
> It's MIT licensed: https://github.com/vimalsri318/Github-Heatmap-3D. Happy to answer questions.

Post on a weekday morning, US Eastern time.

## Product Hunt

- **Name:** GitHub Heatmap 3D
- **Tagline (60 chars):** Your GitHub contributions as a 3D city, galaxy or forest
- **Description:** Type your GitHub username and your year becomes a 3D world: a city, a night skyline, a galaxy or a forest, one shape per day. Spin it, hear it as a song, and embed it on your website or GitHub README, where it animates with no scripts. Free and open source.
- **Topics:** Developer Tools, Open Source, GitHub, Design Tools
- **First comment:** why you built it, what was hard (the animated SVG), and what's next. Ask people to share their own city.
- **Gallery:** the recording first, then one image per world, then the README on a real profile.

## Dev.to / Hashnode / Medium

Article: `How I made an animated 3D chart that works inside a GitHub README`. Walk through the problem (no scripts in READMEs), the clip-path-and-slide trick, file size, and caching for traffic. End with the link. Tags: `javascript`, `github`, `svg`, `opensource`.

## Directories (one-time submissions)

- [ ] Indie Hackers (Products) and a "Show IH" post
- [ ] BetaList, Uneed, Peerlist Launchpad, Microlaunch
- [ ] awesome lists by pull request: `awesome-github-profile-readme`, `awesome-readme`, `awesome-threejs`
- [ ] X / Bluesky / Mastodon: the recording plus one sentence and the link
