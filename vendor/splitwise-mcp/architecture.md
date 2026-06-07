# How It All Works — Architecture Diagram

## The Big Picture

```
 YOU (Human)
  │
  │  You type natural language like:
  │  "Add a $45 dinner split equally in our Trip group"
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE (Desktop or CLI)                   │
│                                                             │
│  Claude is the BRAIN. It:                                   │
│  1. Understands what you said in plain English              │
│  2. Figures out which Splitwise tool to use                 │
│  3. Fills in the right parameters (amount, group, etc.)     │
│  4. Calls the MCP server with those parameters              │
│  5. Reads the response and explains it back to you          │
│                                                             │
│  Claude is the MCP CLIENT — it discovers and calls tools    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │  MCP Protocol
                           │  (stdio if local, streamable-http if remote)
                           │
                           │  Claude sends: "call create_expense
                           │  with group_id=123, cost=45..."
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               splitwise_server.py (MCP SERVER)              │
│                                                             │
│  LOCAL MODE:  Runs on your Mac as a subprocess              │
│  REMOTE MODE: Runs on a cloud server (Hostinger, VPS, etc.) │
│                                                             │
│  This is the HANDS. It:                                     │
│  1. Receives tool calls from Claude                         │
│  2. Translates them into Splitwise API requests             │
│  3. Sends HTTP requests to Splitwise                        │
│  4. Returns the results back to Claude                      │
│                                                             │
│  Tools: list_groups, create_expense, delete_expense, etc.   │
│  Auth: Uses your SPLITWISE_API_KEY from .env file           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │  HTTPS (internet)
                           │  Sends: POST /api/v3.0/create_expense
                           │  with your API key as Bearer token
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   SPLITWISE API (Cloud)                      │
│                   secure.splitwise.com                       │
│                                                             │
│  Splitwise's servers that:                                  │
│  1. Verify your API key is valid                            │
│  2. Execute the action (add expense, delete, etc.)          │
│  3. Update your Splitwise account                           │
│  4. Return success/error response                           │
│                                                             │
│  Changes show up in the Splitwise app on everyone's phone!  │
└─────────────────────────────────────────────────────────────┘
```

## Step-by-Step: What happens when you say "Add a $45 dinner"

```
Step 1:  YOU  ──"Add a $45 dinner split equally"──►  CLAUDE
               (you type in Claude Desktop or CLI)

Step 2:  CLAUDE thinks:
         "They want to create an expense.
          I need: group_id, description, cost, currency.
          Let me call the create_expense tool."

Step 3:  CLAUDE  ──call create_expense(───►  MCP SERVER
                   group_id=123,              (splitwise_server.py)
                   description="Dinner",
                   cost="45",
                   currency_code="USD",
                   split_type="equal")

Step 4:  MCP SERVER  ──POST /create_expense──►  SPLITWISE API
                       Authorization: Bearer     (secure.splitwise.com)
                       your_api_key
                       {cost: 45, ...}

Step 5:  SPLITWISE API  ──{"success", id: 789}──►  MCP SERVER
         (expense created, visible in the app!)

Step 6:  MCP SERVER  ──{"status": "created",──►  CLAUDE
                        "id": 789, ...}

Step 7:  CLAUDE  ──"Done! Added Dinner for──►  YOU
                   $45 split equally."
```

## Local Mode vs Remote Mode

### Local Mode (default — your laptop)

```
┌─────────────────────────────────┐      ┌──────────────────────────┐
│         YOUR MAC                │      │      THE INTERNET        │
│                                 │      │                          │
│  ┌─────────────────────────┐    │      │  ┌────────────────────┐  │
│  │ Claude Desktop / CLI    │    │      │  │  Splitwise Cloud   │  │
│  │ (MCP Client)            │    │      │  │  Servers           │  │
│  └────────────┬────────────┘    │      │  └────────▲───────────┘  │
│               │ stdio           │      │           │              │
│  ┌────────────▼────────────┐    │      │           │ HTTPS        │
│  │ splitwise_server.py     │────│──────│───────────┘              │
│  │ (MCP Server)            │    │      │                          │
│  └─────────────────────────┘    │      │                          │
│                                 │      │                          │
│  ┌─────────────────────────┐    │      │                          │
│  │ .env (API key)          │    │      │                          │
│  └─────────────────────────┘    │      │                          │
└─────────────────────────────────┘      └──────────────────────────┘

  ✅ Simple to set up
  ❌ Only works when your laptop is on
```

### Remote Mode (always-on server)

```
┌──────────────────┐      ┌──────────────────────────────────────────┐
│   YOUR DEVICE    │      │            THE INTERNET                  │
│   (any device)   │      │                                          │
│                  │      │  ┌──────────────────────┐                │
│  ┌────────────┐  │      │  │ YOUR SERVER          │                │
│  │ Claude     │  │ HTTP │  │ (Hostinger / VPS)    │                │
│  │ Desktop    │──│──────│──│                      │                │
│  │ or CLI     │  │      │  │ splitwise_server.py  │     HTTPS      │
│  └────────────┘  │      │  │ running with --remote│──────────┐     │
│                  │      │  │ (streamable-http)    │          │     │
│                  │      │  │ .env (API key)       │          │     │
│                  │      │  └──────────────────────┘          │     │
│                  │      │                                    ▼     │
│                  │      │                          ┌──────────────┐│
│                  │      │                          │  Splitwise   ││
│                  │      │                          │  API         ││
│                  │      │                          └──────────────┘│
└──────────────────┘      └──────────────────────────────────────────┘

  ✅ Works 24/7 even when laptop is off
  ✅ Can be shared with others (each person needs their own Splitwise API key)
  ❌ Requires a server (small cost)
```

## Key Concepts Simplified

| Term | What it means | Analogy |
|------|--------------|---------|
| MCP | A standard way for Claude to use external tools | Like a universal remote control protocol |
| MCP Client | Claude (Desktop or CLI) — discovers and calls tools | The person holding the remote |
| MCP Server | Our splitwise_server.py — provides the tools | The TV receiving remote signals |
| Tool | A specific action like "create_expense" | A button on the remote |
| stdio | How Claude talks to a local server (standard input/output) | A direct cable between remote and TV |
| streamable-http | How Claude talks to a remote server (HTTP, replaces old SSE) | A wireless signal to a TV far away |
| API Key | Your password to access Splitwise's API | Your house key |
| Bearer Token | How the API key is sent in HTTP requests | Showing your ID at the door |
| Fork | Your own copy of someone's GitHub project | Photocopying a recipe to modify |
| Pull Request | Suggesting changes back to the original project | Saying "hey, my version of the recipe is better — want to try it?" |
