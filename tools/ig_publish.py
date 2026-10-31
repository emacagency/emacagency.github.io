"""Publish queued Instagram Reels with the Instagram Graph API (Instagram Login, free).
Each research/ig-queue/<slug>.json holds {"video_url": ..., "caption": ..., "cover_ms": optional}.
A published file gets "published": {"id", "permalink"} written back so it is never posted twice."""
import json, os, pathlib, sys, time, urllib.parse, urllib.request
TOKEN = os.environ.get("IG_TOKEN")
if not TOKEN: sys.exit("IG_TOKEN secret is missing")
API = "https://graph.instagram.com/v21.0"
def call(method, path, **params):
    params["access_token"] = TOKEN
    data = urllib.parse.urlencode(params).encode()
    url = f"{API}/{path}" + ("" if method == "POST" else "?" + data.decode())
    req = urllib.request.Request(url, data=data if method == "POST" else None, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
    except urllib.error.HTTPError as e: sys.exit(f"{path}: {e.code} {e.read().decode()}")
me = call("GET", "me", fields="user_id,username")
print("account:", me.get("username"))
for f in sorted(pathlib.Path("research/ig-queue").glob("*.json")):
    job = json.loads(f.read_text(encoding="utf-8"))
    if job.get("published"): continue
    p = {"media_type": "REELS", "video_url": job["video_url"], "caption": job["caption"], "share_to_feed": "true"}
    if job.get("cover_ms") is not None: p["thumb_offset"] = str(job["cover_ms"])
    c = call("POST", "me/media", **p)["id"]
    for _ in range(60):
        st = call("GET", c, fields="status_code,status")
        if st.get("status_code") == "FINISHED": break
        if st.get("status_code") == "ERROR": sys.exit(f"{f.name}: {st}")
        time.sleep(10)
    pid = call("POST", "me/media_publish", creation_id=c)["id"]
    link = call("GET", pid, fields="permalink").get("permalink")
    job["published"] = {"id": pid, "permalink": link}
    f.write_text(json.dumps(job, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("published", f.name, link)
