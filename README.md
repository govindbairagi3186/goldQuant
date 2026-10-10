# goldQuant

MCX gold contract-spread dashboard: live radar, paper trading, daily backtest with stop-loss, auto-tune, term curve, data cleaning, and an AI assistant that can answer any question.

## Run
```
node server.js        # Node >= 20, no dependencies
```
Open http://localhost:3000. Copy `.env.example` to `.env` to enable server-side AI.

## AI assistant
Answers any topic and also sees your live signals. Provider order: Claude sandbox, server (`AI_API_URL`/`AI_API_KEY`/`AI_MODEL`), then a key saved in Settings (browser only, works on GitHub Pages). Without a provider it answers dashboard questions locally.

Prices are simulated unless you connect a WebSocket feed. Nothing here is financial advice.
