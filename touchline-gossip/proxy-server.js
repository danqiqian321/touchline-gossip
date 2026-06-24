// proxy-server.js
// Run with: node proxy-server.js
// Then open worldcup-tracker.html via http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_BASE = 'api.football-data.org';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || '';
console.log('Anthropic key loaded:', ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.slice(0,10) + '...' : 'EMPTY');
console.log('Football key loaded:', FOOTBALL_API_KEY ? FOOTBALL_API_KEY.slice(0,10) + '...' : 'EMPTY');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  // Proxy API requests
  if (req.url.startsWith('/api/') && req.url !== '/api/commentary') {
    const apiKey = FOOTBALL_API_KEY;
    const apiPath = req.url.replace('/api', '/v4');

    const options = {
      hostname: API_BASE,
      path: apiPath,
      method: 'GET',
      headers: {
        'X-Auth-Token': apiKey || ''
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });

    proxyReq.end();
    return;
  }

  // Proxy Claude API for sassy commentary
  if (req.url === '/api/commentary' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { matchSummary, gameState, lineCount = 5 } = JSON.parse(body);

      const isReply = gameState === 'reply';

      // Abuse guard: reject off-topic user messages before hitting Claude
      if (isReply) {
        const userMsg = matchSummary.split('A friend just said in the group chat: "')[1]?.replace('"', '').toLowerCase() || '';
        const offTopicPatterns = [
          /write (me |a |some )?(code|function|script|program|app|class|api|sql|query|html|css|python|javascript)/i,
          /help (me )?(with |build |create |make |write |fix |debug )/i,
          /\b(translate|summarize|essay|email|cover letter|resume|cv|recipe)\b/i,
          /\b(how (do|to) (make|build|create|write|code|install|set up))\b/i,
          /\b(what is|explain|define|tell me about)\b(?!.*(goal|game|match|score|player|team|world cup|soccer|football))/i,
          /\b(ignore|forget|disregard).*(prompt|instruction|rule|system)/i,
          // Inappropriate/harmful content
          /\b(porn|pornography|nude|naked|sex|sexual|xxx|nsfw|hentai|explicit)\b/i,
          /\b(pedophil|pedo|child abuse|cp |child porn|minor|underage).*(sex|abuse|explicit|nude|naked)/i,
          /\b(rape|molest|assault|abuse)\b/i,
          /\b(kill|murder|bomb|terrorist|shoot|weapon|gun|knife).*(how|make|build|get|buy)\b/i,
          /\b(drug|cocaine|heroin|meth|fentanyl).*(buy|sell|make|get)\b/i,
        ];
        const isOffTopic = offTopicPatterns.slice(0, 6).some(p => p.test(userMsg));
        const isInappropriate = offTopicPatterns.slice(6).some(p => p.test(userMsg));
        const rejectMsg = isInappropriate
          ? JSON.stringify(["that's not okay here", "yeah we don't do that babe"])
          : JSON.stringify(["bestie this is a world cup chat not google", "we only talk football here babe 💅"]);
        if (isOffTopic || isInappropriate) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: rejectMsg }] }));
          return;
        }
      }
      const situationLine = gameState === 'live'
        ? "there is a game happening RIGHT NOW and you're watching it live"
        : gameState === 'finished'
        ? "the game just finished, no game is currently live — you're recapping with friends"
        : "no game is on right now, a match is coming up soon";

      const prompt = isReply
        ? `Two friends (Ashley and Kayla) are in a group chat watching the World Cup. A friend just sent a message. Write ONE reply from Ashley (informed, factual, occasionally snarky) and ONE reply from Kayla (flirty, playful, fun). Each reply under 10 words, all lowercase, no ending punctuation, casual texting style.

Context: ${matchSummary}

Respond ONLY with a JSON array of exactly 2 strings — [ashley's reply, kayla's reply] — no markdown, no preamble.`
        : `You're texting a group chat — ${situationLine}. Write ${lineCount} different one-liner reactions, each under 10 words, all lowercase, no ending punctuation, casual texting style with contractions.

STRICT RULE: Only reference facts from the match update below — score, scorer names, who's leading, cards, subs, recent form. Do NOT mention the game minute or time — you're not a clock. Do NOT use outside knowledge. Never say "right now" or start with "this". Name the actual team or player.

TONE: ${gameState === 'live' ? 'excited, in-the-moment' : gameState === 'finished' ? 'chill and reflective, recapping casually' : 'anticipatory, counting down'}.

Respond ONLY with a JSON array of ${lineCount} strings, no markdown, no preamble:
["line 1","line 2",...]

Match update:\n${matchSummary}`;

      const payload = JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: isReply ? 150 : (lineCount > 5 ? 500 : 300),
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });

      proxyReq.on('error', (e) => {
        console.error('Proxy request error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
    return;
  }

  // Serve static files
  let filePath = req.url === '/' ? '/touchline-gossip.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
