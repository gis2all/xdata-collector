from __future__ import annotations

import re
from hashlib import sha1
from urllib.parse import urlsplit, urlunsplit

_X_STATUS_PATTERN = re.compile(r"^/(?P<user>[^/]+)/status/(?P<tweet_id>\d+)(?:/.*)?$")
_X_HOSTS = {
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
    "mobile.x.com",
}


def canonicalize_source_url(url: str | None) -> str:
    if not url:
        return ""

    cleaned = url.strip()
    if not cleaned:
        return ""

    parsed = urlsplit(cleaned)
    host = parsed.netloc.lower()
    path = parsed.path.rstrip("/")

    if host in _X_HOSTS:
        match = _X_STATUS_PATTERN.match(path)
        if match:
            tweet_id = match.group("tweet_id")
            return f"https://x.com/i/status/{tweet_id}"

    return urlunsplit((parsed.scheme.lower(), host, path, "", ""))


def build_source_dedupe_key(
    tweet_id: str | None = None,
    url: str | None = None,
    text: str | None = None,
    author: str | None = None,
) -> str | None:
    if tweet_id and str(tweet_id).strip():
        return f"tweet:{str(tweet_id).strip()}"

    canonical_url = canonicalize_source_url(url)
    if canonical_url:
        if canonical_url.startswith("https://x.com/i/status/"):
            return f"tweet:{canonical_url.rsplit('/', 1)[-1]}"
        return f"url:{canonical_url}"

    normalized_text = " ".join((text or "").split()).lower()
    normalized_author = (author or "").strip().lower()
    if not normalized_text:
        return None

    digest_input = f"{normalized_author}|{normalized_text}"
    digest = sha1(digest_input.encode("utf-8")).hexdigest()[:16]
    return f"text:{digest}"
