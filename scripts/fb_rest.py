"""RTDB REST access for Mac scripts after the 2026-11-20 lock-down (rules: workStatus needs auth).

Unauthenticated GETs such as urlopen(".../workStatus/charger4eleccar.json") stop working once
database.rules.secure.json is deployed. Scripts wrap the URL with authed(url): it appends an OAuth
access_token from the service-account key (admin rights, bypasses rules), the same way
migrate_michochi_lte_keys.py already does.

The key file lives outside git (main worktree root). It is never printed.

    from fb_rest import authed
    ws = json.load(urllib.request.urlopen(authed(WS_URL), timeout=120))
"""
import time
from pathlib import Path

SA_KEY = Path("/Users/woodelight/Projects/ami-work/ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json")
_SCOPES = ["https://www.googleapis.com/auth/firebase.database",
           "https://www.googleapis.com/auth/userinfo.email"]
_tok = {"v": None, "exp": 0.0}


def access_token():
    if _tok["v"] and time.time() < _tok["exp"] - 120:
        return _tok["v"]
    from google.oauth2 import service_account
    import google.auth.transport.requests as gr
    c = service_account.Credentials.from_service_account_file(str(SA_KEY), scopes=_SCOPES)
    c.refresh(gr.Request())
    _tok["v"] = c.token
    _tok["exp"] = c.expiry.timestamp() if c.expiry else time.time() + 3000
    return c.token


def authed(url):
    """url + access_token (keeps an existing query string)."""
    return url + ("&" if "?" in url else "?") + "access_token=" + access_token()
