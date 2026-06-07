"""
Splitwise MCP Server
====================
A single-file MCP server that exposes Splitwise API tools to Claude.
Supports all Splitwise currencies. Works locally (stdio) or remotely (SSE).

Local:   python3 splitwise_server.py
Remote:  python3 splitwise_server.py --sse
"""

import os
import sys
import json
import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
load_dotenv()

API_KEY = os.getenv("SPLITWISE_API_KEY")
BASE_URL = "https://secure.splitwise.com/api/v3.0"

# ---------------------------------------------------------------------------
# MCP Server
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "Splitwise",
    host="0.0.0.0",
    port=8000,
    instructions=(
        "You manage Splitwise expenses through natural language. "
        "You can list groups, add/edit/delete expenses, record payments, "
        "and check balances. Use list_currencies to see valid currency codes. "
        "When the user mentions currency symbols, map them: "
        "$ = USD, € = EUR, £ = GBP, ¥ = JPY, ₹ = INR, ₩ = KRW, etc. "
        "Always confirm the group name and amount before creating expenses."
    ),
)

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------
def _headers():
    return {"Authorization": f"Bearer {API_KEY}"}


def _get(path: str, params: dict | None = None) -> dict:
    """GET request to Splitwise API."""
    with httpx.Client() as client:
        r = client.get(f"{BASE_URL}{path}", headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def _post(path: str, data: dict | None = None) -> dict:
    """POST request to Splitwise API."""
    with httpx.Client() as client:
        r = client.post(f"{BASE_URL}{path}", headers=_headers(), data=data)
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def get_current_user() -> str:
    """Get your Splitwise profile — name, email, default currency."""
    data = _get("/get_current_user")
    user = data["user"]
    return json.dumps({
        "id": user["id"],
        "first_name": user["first_name"],
        "last_name": user.get("last_name", ""),
        "email": user.get("email", ""),
        "default_currency": user.get("default_currency_code", ""),
    }, indent=2)


@mcp.tool()
def list_currencies() -> str:
    """List all currencies supported by Splitwise. Use this to find valid currency codes."""
    data = _get("/get_currencies")
    currencies = [
        {"code": c["currency_code"], "symbol": c.get("unit", "")}
        for c in data.get("currencies", [])
    ]
    return json.dumps(currencies, indent=2)


@mcp.tool()
def list_groups() -> str:
    """List all your Splitwise groups with their IDs and member counts."""
    data = _get("/get_groups")
    groups = []
    for g in data["groups"]:
        # Skip the non-group entry (id=0 is "non-group expenses")
        if g["id"] == 0:
            continue
        groups.append({
            "id": g["id"],
            "name": g["name"],
            "members": [
                {"id": m["id"], "name": f"{m['first_name']} {m.get('last_name', '')}".strip()}
                for m in g.get("members", [])
            ],
            "simplified_debts": g.get("simplified_debts", []),
        })
    return json.dumps(groups, indent=2)


@mcp.tool()
def get_group(group_id: int) -> str:
    """
    Get full details of a Splitwise group — members, balances, and outstanding debts.

    Args:
        group_id: The numeric ID of the group (get this from list_groups).
    """
    data = _get(f"/get_group/{group_id}")
    g = data["group"]
    members = []
    for m in g.get("members", []):
        balances = []
        for b in m.get("balance", []):
            balances.append({
                "currency": b["currency_code"],
                "amount": b["amount"],
            })
        members.append({
            "id": m["id"],
            "name": f"{m['first_name']} {m.get('last_name', '')}".strip(),
            "balances": balances,
        })
    return json.dumps({
        "id": g["id"],
        "name": g["name"],
        "members": members,
        "simplified_debts": g.get("simplified_debts", []),
    }, indent=2)


@mcp.tool()
def list_expenses(group_id: int, limit: int = 20) -> str:
    """
    List recent expenses in a Splitwise group.

    Args:
        group_id: The numeric ID of the group.
        limit: Number of expenses to return (default 20, max 100).
    """
    limit = min(limit, 100)
    data = _get("/get_expenses", params={"group_id": group_id, "limit": limit})
    expenses = []
    for e in data["expenses"]:
        if e.get("deleted_at"):
            continue
        expenses.append({
            "id": e["id"],
            "description": e["description"],
            "cost": e["cost"],
            "currency": e["currency_code"],
            "date": e["date"],
            "created_by": e.get("created_by", {}).get("first_name", "Unknown"),
            "payment": e.get("payment", False),
            "users": [
                {
                    "name": f"{u['user']['first_name']} {u['user'].get('last_name', '')}".strip(),
                    "user_id": u["user_id"],
                    "paid": u["paid_share"],
                    "owed": u["owed_share"],
                }
                for u in e.get("users", [])
            ],
        })
    return json.dumps(expenses, indent=2)


@mcp.tool()
def get_expense(expense_id: int) -> str:
    """
    Get full details of a single expense.

    Args:
        expense_id: The numeric ID of the expense.
    """
    data = _get(f"/get_expense/{expense_id}")
    e = data["expense"]
    return json.dumps({
        "id": e["id"],
        "description": e["description"],
        "cost": e["cost"],
        "currency": e["currency_code"],
        "date": e["date"],
        "category": e.get("category", {}).get("name", "General"),
        "payment": e.get("payment", False),
        "users": [
            {
                "name": f"{u['user']['first_name']} {u['user'].get('last_name', '')}".strip(),
                "user_id": u["user_id"],
                "paid": u["paid_share"],
                "owed": u["owed_share"],
            }
            for u in e.get("users", [])
        ],
    }, indent=2)


@mcp.tool()
def create_expense(
    group_id: int,
    description: str,
    cost: str,
    currency_code: str = "USD",
    split_type: str = "equal",
    payer_id: int | None = None,
    shares: str = "",
    date: str = "",
) -> str:
    """
    Create a new expense in a Splitwise group.

    Args:
        group_id: The numeric group ID.
        description: What the expense is for (e.g., "Dinner", "Cab to airport").
        cost: Total cost as a string (e.g., "45000" or "120.50").
        currency_code: ISO currency code (e.g., USD, EUR, GBP, INR, KRW, JPY). Defaults to USD.
            Use list_currencies to see all valid codes.
        split_type: How to split — "equal", "exact", or "percentage". Defaults to "equal".
        payer_id: User ID of who paid. If not set, defaults to the authenticated user.
            Get user IDs from get_group or list_groups.
        shares: JSON string for non-equal splits. Required for "exact" and "percentage".
            Format: [{"user_id": 123, "amount": "15000"}, {"user_id": 456, "amount": "30000"}]
            For percentage: [{"user_id": 123, "percent": "50"}, {"user_id": 456, "percent": "50"}]
        date: Expense date as YYYY-MM-DD. Defaults to today.
    """
    currency_code = currency_code.upper()

    # Get group members for splitting
    group_data = _get(f"/get_group/{group_id}")
    members = group_data["group"]["members"]

    # If no payer specified, use the authenticated user
    if not payer_id:
        me = _get("/get_current_user")["user"]
        payer_id = me["id"]

    # Build the expense payload using Splitwise's indexed user format
    payload = {
        "cost": cost,
        "description": description,
        "group_id": str(group_id),
        "currency_code": currency_code,
    }
    if date:
        payload["date"] = date

    total = float(cost)

    if split_type == "equal":
        # Equal split among all group members
        per_person = round(total / len(members), 2)
        # Handle rounding — give remainder to the first person
        remainder = round(total - per_person * len(members), 2)

        for i, m in enumerate(members):
            owed = per_person + (remainder if i == 0 else 0)
            paid = total if m["id"] == payer_id else 0.0
            payload[f"users__{i}__user_id"] = str(m["id"])
            payload[f"users__{i}__paid_share"] = f"{paid:.2f}"
            payload[f"users__{i}__owed_share"] = f"{owed:.2f}"

    elif split_type == "exact":
        if not shares:
            return "Error: 'shares' is required for exact splits. Provide JSON like: [{\"user_id\": 123, \"amount\": \"15000\"}]"
        share_list = json.loads(shares)
        share_map = {s["user_id"]: float(s["amount"]) for s in share_list}

        # Verify shares add up to total
        share_total = sum(share_map.values())
        if abs(share_total - total) > 0.02:
            return f"Error: Shares add up to {share_total} but cost is {total}. They must match."

        for i, m in enumerate(members):
            owed = share_map.get(m["id"], 0.0)
            paid = total if m["id"] == payer_id else 0.0
            payload[f"users__{i}__user_id"] = str(m["id"])
            payload[f"users__{i}__paid_share"] = f"{paid:.2f}"
            payload[f"users__{i}__owed_share"] = f"{owed:.2f}"

    elif split_type == "percentage":
        if not shares:
            return "Error: 'shares' is required for percentage splits. Provide JSON like: [{\"user_id\": 123, \"percent\": \"50\"}]"
        share_list = json.loads(shares)
        pct_map = {s["user_id"]: float(s["percent"]) for s in share_list}

        # Verify percentages add up to 100
        pct_total = sum(pct_map.values())
        if abs(pct_total - 100.0) > 0.1:
            return f"Error: Percentages add up to {pct_total}% but must be 100%."

        for i, m in enumerate(members):
            pct = pct_map.get(m["id"], 0.0)
            owed = round(total * pct / 100.0, 2)
            paid = total if m["id"] == payer_id else 0.0
            payload[f"users__{i}__user_id"] = str(m["id"])
            payload[f"users__{i}__paid_share"] = f"{paid:.2f}"
            payload[f"users__{i}__owed_share"] = f"{owed:.2f}"
    else:
        return f"Error: split_type must be 'equal', 'exact', or 'percentage'. Got: {split_type}"

    result = _post("/create_expense", data=payload)

    # Splitwise returns errors in the response body, not HTTP status
    if "errors" in result and result["errors"]:
        return f"Splitwise error: {json.dumps(result['errors'])}"

    expenses = result.get("expenses", [])
    if expenses:
        e = expenses[0]
        return json.dumps({
            "status": "created",
            "id": e["id"],
            "description": e["description"],
            "cost": e["cost"],
            "currency": e["currency_code"],
        }, indent=2)
    return json.dumps(result, indent=2)


@mcp.tool()
def update_expense(
    expense_id: int,
    description: str | None = None,
    cost: str | None = None,
    currency_code: str | None = None,
    date: str | None = None,
) -> str:
    """
    Update an existing expense (description, cost, currency, or date).

    Args:
        expense_id: The numeric expense ID to update.
        description: New description (optional).
        cost: New total cost as string (optional).
        currency_code: New ISO currency code (optional). Use list_currencies for valid codes.
        date: New date as YYYY-MM-DD (optional).
    """
    payload = {}
    if description:
        payload["description"] = description
    if currency_code:
        payload["currency_code"] = currency_code.upper()
    if date:
        payload["date"] = date

    # When cost changes, shares must be recalculated — otherwise Splitwise rejects it.
    # We fetch the existing expense and scale everyone's shares proportionally.
    if cost:
        payload["cost"] = cost
        existing = _get(f"/get_expense/{expense_id}")["expense"]
        old_cost = float(existing["cost"])
        new_cost = float(cost)
        users = existing.get("users", [])

        if old_cost > 0 and users:
            ratio = new_cost / old_cost
            scaled = []
            for u in users:
                scaled.append({
                    "user_id": u["user_id"],
                    "paid": round(float(u["paid_share"]) * ratio, 2),
                    "owed": round(float(u["owed_share"]) * ratio, 2),
                })

            # Fix rounding drift: make sure paid and owed shares each sum exactly to new_cost
            for label, key in [("paid", "paid"), ("owed", "owed")]:
                total = sum(s[key] for s in scaled)
                diff = round(new_cost - total, 2)
                if diff != 0:
                    # Give the rounding difference to the first person with a non-zero share
                    for s in scaled:
                        if s[key] > 0:
                            s[key] = round(s[key] + diff, 2)
                            break

            for i, s in enumerate(scaled):
                payload[f"users__{i}__user_id"] = str(s["user_id"])
                payload[f"users__{i}__paid_share"] = f"{s['paid']:.2f}"
                payload[f"users__{i}__owed_share"] = f"{s['owed']:.2f}"

    if not payload:
        return "Error: Nothing to update. Provide at least one field to change."

    result = _post(f"/update_expense/{expense_id}", data=payload)

    if "errors" in result and result["errors"]:
        return f"Splitwise error: {json.dumps(result['errors'])}"

    expenses = result.get("expenses", [])
    if expenses:
        e = expenses[0]
        return json.dumps({
            "status": "updated",
            "id": e["id"],
            "description": e["description"],
            "cost": e["cost"],
            "currency": e["currency_code"],
        }, indent=2)
    return json.dumps(result, indent=2)


@mcp.tool()
def delete_expense(expense_id: int) -> str:
    """
    Delete an expense from Splitwise.

    Args:
        expense_id: The numeric expense ID to delete.
    """
    result = _post(f"/delete_expense/{expense_id}")

    if "errors" in result and result["errors"]:
        return f"Splitwise error: {json.dumps(result['errors'])}"

    if result.get("success"):
        return json.dumps({"status": "deleted", "expense_id": expense_id}, indent=2)
    return json.dumps(result, indent=2)


@mcp.tool()
def create_payment(
    group_id: int,
    payer_id: int,
    payee_id: int,
    amount: str,
    currency_code: str = "USD",
    date: str = "",
) -> str:
    """
    Record a settlement payment (someone paying someone back) in a group.

    Args:
        group_id: The group ID where the payment is recorded.
        payer_id: User ID of the person making the payment (paying back).
        payee_id: User ID of the person receiving the payment.
        amount: Amount being paid as a string (e.g., "15000" or "50.00").
        currency_code: ISO currency code (e.g., USD, EUR, INR). Defaults to USD.
        date: Payment date as YYYY-MM-DD. Defaults to today.
    """
    currency_code = currency_code.upper()

    # A payment in Splitwise is an expense with payment=true
    # The payer pays and the payee owes
    payload = {
        "cost": amount,
        "description": "Payment",
        "group_id": str(group_id),
        "currency_code": currency_code,
        "payment": "true",
        "users__0__user_id": str(payer_id),
        "users__0__paid_share": amount,
        "users__0__owed_share": "0.00",
        "users__1__user_id": str(payee_id),
        "users__1__paid_share": "0.00",
        "users__1__owed_share": amount,
    }
    if date:
        payload["date"] = date

    result = _post("/create_expense", data=payload)

    if "errors" in result and result["errors"]:
        return f"Splitwise error: {json.dumps(result['errors'])}"

    expenses = result.get("expenses", [])
    if expenses:
        e = expenses[0]
        return json.dumps({
            "status": "payment_recorded",
            "id": e["id"],
            "amount": e["cost"],
            "currency": e["currency_code"],
        }, indent=2)
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if not API_KEY:
        print("ERROR: SPLITWISE_API_KEY not set. Copy .env.example to .env and add your key.")
        exit(1)

    # --remote flag starts the server in streamable-http mode (for remote hosting)
    # --sse flag for legacy SSE mode (deprecated, use --remote instead)
    # Default is stdio mode (for local Claude Desktop / Claude Code)
    if "--remote" in sys.argv:
        mcp.run(transport="streamable-http")
    elif "--sse" in sys.argv:
        mcp.run(transport="sse")
    else:
        mcp.run()
