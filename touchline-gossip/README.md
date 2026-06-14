# Touchline Gossip 🌸⚽

A pink-themed World Cup 2026 tracker with AI-powered group chat commentary (Ashley, Kayla, Mia).

## Features
- Live match scores, goal scorers, and standings via [football-data.org](https://www.football-data.org/)
- AI-generated commentary via Claude (Anthropic API)
- Dynamic, livestream-style "Hot Take" chat feed

## Running locally

```bash
export ANTHROPIC_API_KEY="your-anthropic-key"
export FOOTBALL_API_KEY="your-football-data-key"
node proxy-server.js
```

Then open http://localhost:3000

## Deploying to Render

1. Push this repo to GitHub.
2. On [Render](https://render.com), create a new **Web Service** and connect this repo.
3. Set:
   - **Build Command**: (leave empty)
   - **Start Command**: `node proxy-server.js`
4. Add environment variables in Render's dashboard:
   - `ANTHROPIC_API_KEY`
   - `FOOTBALL_API_KEY`
5. Deploy — Render will provide a public URL.

## Files
- `touchline-gossip.html` — main frontend
- `proxy-server.js` — Node server (serves static files + proxies football-data.org and Anthropic API)
- `*.svg`, `*.png` — design assets (logos, stars, pitch background)
