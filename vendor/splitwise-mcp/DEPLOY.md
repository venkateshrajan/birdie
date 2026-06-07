# Deploying to Hostinger VPS — Step by Step

This guide walks you through deploying the Splitwise MCP server on your Hostinger VPS
so it runs 24/7, even when your laptop is off.

---

## Step 0: Find your VPS credentials on Hostinger

1. Log into [hpanel.hostinger.com](https://hpanel.hostinger.com)
2. Click on your VPS plan
3. Look for **SSH Access** section — you'll need:
   - **IP Address** (e.g., `123.45.67.89`)
   - **Username** (usually `root`)
   - **Password** (or you can set up SSH keys later)
   - **SSH Port** (usually `22`)

Write these down — you'll need them in the next step.

---

## Step 1: SSH into your VPS

Open **Terminal** on your Mac (search "Terminal" in Spotlight, or find it in Applications → Utilities).

Type this command, replacing the IP with yours:

```bash
ssh root@YOUR_VPS_IP_ADDRESS
```

For example:
```bash
ssh root@123.45.67.89
```

**What happens:**
- First time: it asks "Are you sure you want to continue connecting?" → type `yes`
- Then it asks for your password → type it (you won't see characters as you type, that's normal)
- You'll see a prompt like `root@vps:~#` — you're now on your VPS!

**How to remember:** `ssh` = "connect to a remote server", `root` = the admin user, `@` = "at", then the IP address.

To disconnect later: type `exit` or press `Ctrl+D`.

---

## Step 2: Install Python and dependencies on VPS

Once SSH'd in, run these commands one at a time:

```bash
# Update the system packages (like updating apps on your phone)
apt update && apt upgrade -y

# Install Python 3 and pip (the package manager for Python)
apt install python3 python3-pip python3-venv -y

# Verify Python is installed
python3 --version
```

You should see something like `Python 3.10.x` or higher.

---

## Step 3: Upload the project to VPS

We'll use `git` to get the code onto the VPS. But first, let's do it the simple way using `scp` (secure copy) from your Mac.

**Open a NEW Terminal tab on your Mac** (not the SSH one) and run:

```bash
# Copy the entire project folder to your VPS
# Replace YOUR_VPS_IP with your actual IP
scp -r "/Users/bhavikmuni/Documents/Special Projects/Splitwise_LLM" root@YOUR_VPS_IP:~/splitwise-mcp
```

**What this does:** Copies your project folder from your Mac to the VPS, into a folder called `splitwise-mcp` in the home directory.

It will ask for your VPS password again — type it in.

---

## Step 4: Set up the server on VPS

Switch back to your **SSH terminal** (the one connected to the VPS):

```bash
# Go to the project folder
cd ~/splitwise-mcp

# Create a virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Verify the .env file has your API key
cat .env
```

You should see your Splitwise API key. If not, create it:

```bash
echo "SPLITWISE_API_KEY=your_actual_key_here" > .env
```

---

## Step 5: Test the server on VPS

```bash
# Quick test — does it start?
cd ~/splitwise-mcp
source venv/bin/activate
python3 splitwise_server.py --remote
```

You should see output like `StreamableHTTP session manager started` and `Uvicorn running on http://0.0.0.0:8000`.
Press `Ctrl+C` to stop it.

---

## Step 6: Keep the server running 24/7

If you just run `python3 splitwise_server.py --remote` and close your terminal, the server stops.
We need to set it up as a **system service** so it runs forever, even after reboots.

Create a service file:

```bash
sudo nano /etc/systemd/system/splitwise-mcp.service
```

Paste this (use Ctrl+Shift+V to paste in nano):

```ini
[Unit]
Description=Splitwise MCP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/splitwise-mcp
EnvironmentFile=/root/splitwise-mcp/.env
ExecStart=/root/splitwise-mcp/venv/bin/python3 /root/splitwise-mcp/splitwise_server.py --remote
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save and exit nano: press `Ctrl+X`, then `Y`, then `Enter`.

Now enable and start the service:

```bash
# Reload systemd so it sees the new service
sudo systemctl daemon-reload

# Start the server
sudo systemctl start splitwise-mcp

# Enable it to start on boot
sudo systemctl enable splitwise-mcp

# Check it's running
sudo systemctl status splitwise-mcp
```

You should see "active (running)" in green.

**Useful commands to remember:**

```bash
# Check if server is running
sudo systemctl status splitwise-mcp

# Restart the server (after code changes)
sudo systemctl restart splitwise-mcp

# Stop the server
sudo systemctl stop splitwise-mcp

# See server logs (useful for debugging)
sudo journalctl -u splitwise-mcp -f
```

---

## Step 7: Open the firewall

Your VPS probably blocks port 8000 by default. Let's open it:

```bash
# If using ufw (Ubuntu firewall)
ufw allow 8000/tcp

# Verify
ufw status
```

If ufw is not active, you may need to check Hostinger's firewall settings in the control panel.

---

## Step 8: Test from your Mac

Open a new Terminal tab on your Mac and run:

```bash
# Replace YOUR_VPS_IP with your actual IP
curl -s -o /dev/null -w "%{http_code}" http://YOUR_VPS_IP:8000/mcp
```

If you get `406`, the server is running and accessible from the internet. (406 is expected — it means the server is up but wants proper MCP headers, not a plain curl request.)

---

## Step 9: Connect Claude Desktop to your VPS

Edit your Claude Desktop config on your Mac:

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "splitwise": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://YOUR_VPS_IP:8000/mcp", "--allow-http"]
    }
  }
}
```

Replace `YOUR_VPS_IP` with your actual VPS IP address.

**Note:** This uses `mcp-remote`, a bridge that connects Claude Desktop to your remote server. You need Node.js installed on your Mac for `npx` to work.

Check if you have Node.js: `node --version` in Terminal. If not, install it from [nodejs.org](https://nodejs.org).

Restart Claude Desktop and you should see the Splitwise tools available!

---

## Summary of what's running where

```
YOUR MAC                           YOUR HOSTINGER VPS
┌──────────────────┐               ┌──────────────────────────┐
│ Claude Desktop   │               │ splitwise_server.py      │
│                  │──── HTTP ────►│ running with --remote    │
│ uses mcp-remote  │  (internet)   │ as a systemd service     │
│ to connect       │               │ (runs 24/7, auto-restart)│
└──────────────────┘               └──────────┬───────────────┘
                                              │
                                              │ HTTPS
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Splitwise API            │
                                   │ secure.splitwise.com     │
                                   └──────────────────────────┘
```

---

## Optional: Add HTTPS (recommended for security)

Right now the connection between your Mac and VPS is unencrypted (http).
For better security, you can add HTTPS using a reverse proxy.
This is optional for personal use but recommended if others will use it.

Steps (advanced):
1. Install nginx: `apt install nginx -y`
2. Get a free SSL certificate: use Let's Encrypt with `certbot`
3. Configure nginx to proxy port 8000 with SSL
4. Point a domain to your VPS IP (or use the IP with a self-signed cert)

We can set this up later if needed.
