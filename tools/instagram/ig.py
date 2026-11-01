"""Direct Instagram management through Meta's official Instagram API.

Needs the IG_ACCESS_TOKEN secret. Two kinds of token work:
- Instagram Login token (starts with "IG"): graph.instagram.com, scopes
  instagram_business_basic / _content_publish / _manage_insights / _manage_comments.
- Facebook Login token (starts with "EAA"): graph.facebook.com, the Instagram
  account must be linked to a Facebook Page; scopes instagram_basic,
  instagram_content_publish, instagram_manage_insights, instagram_manage_comments,
  pages_show_list, pages_read_engagement.

Commands (first argument):
  account                 account info, token check
  publish                 publish a Reel: VIDEO_URL, CAPTION, COVER_MS (optional),
                          SHARE_TO_FEED (default true), TRIAL (true = trial reel)
  insights                metrics for the latest N media (LIMIT, default 15)
  comments                recent comments on the latest N media
  reply                   reply to COMMENT_ID with MESSAGE
  refresh                 refresh the long-lived token (prints days left only)

Results go to stdout and, as JSON, to $GITHUB_STEP_SUMMARY when present.
The token is never printed.
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

TOKEN = os.environ.get("IG_ACCESS_TOKEN", "").strip()
FB = TOKEN.startswith("EAA")
API = "https://graph.facebook.com/v23.0" if FB else "https://graph.instagram.com/v23.0"
_UID = None


def call(path, params=None, method="GET"):
    params = dict(params or {})
    params["access_token"] = TOKEN
    data = None
    url = path if path.startswith("http") else f"{API}/{path}"
    if method == "GET":
        url += "?" + urllib.parse.urlencode(params)
    else:
        data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"Instagram API error {e.code} on {path}: {body}")


def out(title, obj):
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    print(f"=== {title}\n{text}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### {title}\n```json\n{text}\n```\n")


def ig_user_id():
    """Instagram professional account id for either token kind."""
    global _UID
    if _UID:
        return _UID
    if os.environ.get("IG_USER_ID"):
        _UID = os.environ["IG_USER_ID"]
    elif FB:
        pages = call("me/accounts", {"fields": "name,instagram_business_account"}).get("data", [])
        linked = [p["instagram_business_account"]["id"] for p in pages if p.get("instagram_business_account")]
        if not linked:
            raise SystemExit("No Instagram account is linked to a Facebook Page this token can see")
        _UID = linked[0]
    else:
        _UID = call("me", {"fields": "user_id"})["user_id"]
    return _UID


def me():
    uid = ig_user_id()
    info = call(uid, {"fields": "username,followers_count,follows_count,media_count"})
    info["user_id"] = uid
    return info


def account():
    out("account", me())


def publish():
    video = os.environ["VIDEO_URL"]
    caption = os.environ.get("CAPTION", "")
    uid = ig_user_id()
    params = {
        "media_type": "REELS",
        "video_url": video,
        "caption": caption,
        "share_to_feed": os.environ.get("SHARE_TO_FEED", "true"),
    }
    if os.environ.get("COVER_MS"):
        params["thumb_offset"] = os.environ["COVER_MS"]
    if os.environ.get("TRIAL", "false").lower() == "true":
        params["trial_params"] = json.dumps({"graduation_strategy": "MANUAL"})
    container = call(f"{uid}/media", params, "POST")["id"]
    for _ in range(60):  # up to ~10 minutes of processing
        status = call(container, {"fields": "status_code,status"})
        if status.get("status_code") == "FINISHED":
            break
        if status.get("status_code") in ("ERROR", "EXPIRED"):
            raise SystemExit(f"Video processing failed: {status}")
        time.sleep(10)
    else:
        raise SystemExit("Video still processing after 10 minutes")
    media_id = call(f"{uid}/media_publish", {"creation_id": container}, "POST")["id"]
    info = call(media_id, {"fields": "id,permalink,timestamp"})
    out("published", info)


REEL_METRICS = "views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time"


def latest_media(limit):
    uid = ig_user_id()
    return call(f"{uid}/media", {
        "fields": "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
        "limit": limit,
    }).get("data", [])


def insights():
    rows = []
    for m in latest_media(int(os.environ.get("LIMIT", "15"))):
        row = {
            "date": m["timestamp"][:16],
            "title": (m.get("caption") or "").split("\n")[0][:60],
            "link": m.get("permalink"),
        }
        metrics = REEL_METRICS if m.get("media_product_type") == "REELS" else "views,reach,likes,comments,saved,shares,total_interactions"
        try:
            for item in call(f"{m['id']}/insights", {"metric": metrics}).get("data", []):
                value = item["values"][0]["value"] if item.get("values") else item.get("total_value", {}).get("value")
                if item["name"] == "ig_reels_avg_watch_time":
                    value = round(value / 1000, 1)  # ms -> seconds
                row[item["name"]] = value
        except SystemExit as e:
            row["error"] = str(e)[:200]
        rows.append(row)
    out("account", me())
    out("insights", rows)


def comments():
    rows = []
    for m in latest_media(int(os.environ.get("LIMIT", "10"))):
        if not m.get("comments_count"):
            continue
        data = call(f"{m['id']}/comments", {"fields": "id,text,username,timestamp,replies{id,text,username}"}).get("data", [])
        rows.append({"reel": (m.get("caption") or "").split("\n")[0][:60], "link": m.get("permalink"), "comments": data})
    out("comments", rows)


def reply():
    res = call(f"{os.environ['COMMENT_ID']}/replies", {"message": os.environ["MESSAGE"]}, "POST")
    out("reply", res)


def refresh():
    if FB:
        # Facebook tokens are checked, not refreshed: extend them in the Access Token Debugger.
        res = call("debug_token", {"input_token": TOKEN}).get("data", {})
        exp = res.get("expires_at") or 0
        days = "never" if exp == 0 else round((exp - time.time()) / 86400)
        out("token", {"valid": res.get("is_valid"), "days_left": days})
        return
    res = call("https://graph.instagram.com/refresh_access_token", {"grant_type": "ig_refresh_token"})
    out("token", {"refreshed": True, "days_left": round(res.get("expires_in", 0) / 86400)})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("IG_ACCESS_TOKEN secret is missing")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "account"
    {"account": account, "publish": publish, "insights": insights,
     "comments": comments, "reply": reply, "refresh": refresh}[cmd]()
