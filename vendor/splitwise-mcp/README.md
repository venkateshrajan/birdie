# Splitwise MCP Server — Control Splitwise With Plain English

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Splitwise API](https://img.shields.io/badge/Splitwise-API%20v3-orange.svg)](https://dev.splitwise.com)

> "Add a ₩45,000 dinner, I paid, split equally."
> Done. No app. No tapping. No math.

---

## Why I Built This

I was about to head on a trip with friends and already dreading the expense tracking.

You know how it goes — someone pays for dinner, someone else grabs the cab, another person covers the hotel deposit. By day two, you've lost track. So you open Splitwise, tap through four screens, type the amount, select the people, pick who paid, hit save. Then do it again for the next thing. And the next.

I thought: *I'm already using Claude for everything else. What if I could just tell it what happened, and it handles Splitwise for me?*

So I built this over a weekend. It's a small Python server that connects Claude AI directly to your Splitwise account. You talk to Claude like a human, and it does the Splitwise work for you — adding expenses, checking balances, recording settlements, fixing mistakes.

No switching apps. No manual entry. Just say what happened.

---

## What It Feels Like to Use

```
You:    "We had a group dinner for ₩65,000. I paid. Split equally."
Claude: Done! Added "Group dinner" for ₩65,000.00 (KRW), split equally
        among 4 members. Each person owes ₩16,250.

You:    "What does everyone owe in the trip group?"
Claude: Here are the current balances:
        • Raj owes you ₩32,500
        • Priya owes you ₩16,250
        • Sam is owed ₩8,000 by the group

You:    "Record that Raj paid me back ₩30,000."
Claude: Payment of ₩30,000 recorded. Raj's balance updated.

You:    "Wait, that dinner was actually ₩72,000. Can you fix it?"
Claude: Updated! "Group dinner" changed to ₩72,000. Shares recalculated.
```

Works with any currency Splitwise supports — USD, EUR, INR, KRW, JPY, and more.

---

## How It Works (The Simple Version)

```
You talk to Claude
       ↓
Claude understands what you want
       ↓
Claude calls this MCP server
       ↓
This server calls the Splitwise API
       ↓
Your Splitwise account updates instantly
       ↓
Everyone's app reflects the change
```

**MCP** (Model Context Protocol) is a standard way to give Claude access to external tools. This project is the "Splitwise tool" — a bridge between Claude and your Splitwise account.

See [architecture.md](architecture.md) for a detailed diagram of how everything connects.

---

## What You Can Do

| Ask Claude | What Happens |
|---|---|
| "List my groups" | Shows all your Splitwise groups with members |
| "Who owes what in the [group]?" | Shows all balances |
| "Add a $52 lunch, I paid, split equally" | Creates the expense |
| "Add $240 hotel — I paid $120, Alex $80, Sam $40" | Exact split |
| "Split the $35 cab 50/30/20" | Percentage split |
| "Record that Alex paid me back $20" | Settlement payment |
| "Delete that last expense" | Removes it |
| "Change the dinner to $60" | Updates and recalculates |

---

## Setup

### What You'll Need

- Python 3.10+ (`python3 --version` to check)
- A Splitwise account + API key from [secure.splitwise.com/apps](https://secure.splitwise.com/apps)
- Claude Desktop or Claude Code

---

### Step 1: Clone and install

```bash
git clone https://github.com/yourusername/splitwise-mcp.git
cd splitwise-mcp
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 2: Add your API key

Create a file called `.env` in the project folder:
```
SPLITWISE_API_KEY=paste_your_key_here
```

**Where to get your key:**
1. Go to [secure.splitwise.com/apps](https://secure.splitwise.com/apps)
2. Click "Register your application"
3. Fill in any name (e.g., "My MCP Server")
4. Copy the **API Key** into your `.env` file

### Step 3: Connect to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "splitwise": {
      "command": "/full/path/to/venv/bin/python3",
      "args": ["/full/path/to/splitwise_server.py"]
    }
  }
}
```

Restart Claude Desktop. You'll see a hammer icon — that means tools are connected.

### Step 4 (Optional): Host on a Server for 24/7 Access

Want it running even when your laptop is off? Deploy to any VPS (I use Hostinger).

See [DEPLOY.md](DEPLOY.md) for the full step-by-step guide.

Once hosted, connect Claude Desktop via:

```json
{
  "mcpServers": {
    "splitwise": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://YOUR_SERVER_IP:8000/mcp", "--allow-http"]
    }
  }
}
```

---

## All Available Tools

| Tool | What It Does |
|---|---|
| `get_current_user` | Your Splitwise profile |
| `list_currencies` | All currencies Splitwise supports |
| `list_groups` | All your groups with member IDs |
| `get_group` | Group details — members, balances, debts |
| `list_expenses` | Recent expenses in a group |
| `get_expense` | Full details of one expense |
| `create_expense` | Add expense (equal, exact, or percentage split) |
| `update_expense` | Edit description, cost, currency, or date |
| `delete_expense` | Remove an expense |
| `create_payment` | Record a settlement between two people |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Claude doesn't see Splitwise tools | Restart Claude Desktop after editing the config |
| 401 Unauthorized error | Check your API key in `.env` is correct |
| "No module named mcp" | Activate your venv: `source venv/bin/activate` |
| Server disconnected | Check server is running: `sudo systemctl status splitwise-mcp` |
| Wrong paths in config | Use full absolute paths, not relative ones |

---

## Project Structure

```
splitwise-mcp/
├── splitwise_server.py   ← The entire server (~500 lines, one file)
├── .env                  ← Your API key (never committed to git)
├── requirements.txt      ← Python dependencies
├── architecture.md       ← How everything connects
├── DEPLOY.md             ← How to host on a VPS
└── README.md             ← This file
```

---

## Built With

- [FastMCP](https://github.com/jlowin/fastmcp) — Python MCP framework
- [Splitwise REST API v3](https://dev.splitwise.com/)
- [httpx](https://www.python-httpx.org/) — HTTP client
- Hosted on Hostinger VPS (Ubuntu)

---

*Built by a first-time Python developer who just wanted to stop manually logging trip expenses. If I can build it, you can use it.*

---

## License

MIT — use it however you like.
