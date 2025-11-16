from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Literal

import os
import re
import requests
import pandas as pd
from dotenv import load_dotenv

# ===================== ENV / CONFIG =====================

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
BASE_URL = "https://www.googleapis.com/youtube/v3"

print("YOUTUBE_API_KEY present:", YOUTUBE_API_KEY is not None)
if YOUTUBE_API_KEY:
    print("YOUTUBE_API_KEY length:", len(YOUTUBE_API_KEY))


# ===================== MODELS =====================

class TrendingVideo(BaseModel):
    video_id: str
    title: str
    channel_title: str
    category_id: str
    category_name: Optional[str]
    published_at: str
    view_count: int
    like_count: Optional[int]
    comment_count: Optional[int]
    duration_seconds: Optional[int]


class TrendingMetrics(BaseModel):
    region: str
    total_videos: int
    total_views: int
    avg_views: float
    median_views: float
    top_channel_by_videos: Optional[str]
    top_channel_video_count: int
    top_channel_by_views: Optional[str]
    top_channel_total_views: int


class TrendingResponse(BaseModel):
    region: str
    videos: List[TrendingVideo]
    metrics: TrendingMetrics


class ChatRequest(BaseModel):
    message: str
    default_region: Optional[str] = None
    default_limit: Optional[int] = None


class ChatResponse(BaseModel):
    reply: str
    region: str
    limit: int


# ===================== HELPERS =====================

def parse_iso8601_duration(duration: str) -> int:
    """
    Convert ISO 8601 duration (e.g. PT15M33S) to seconds.
    """
    if not duration:
        return 0

    pattern = re.compile(
        r"^PT"
        r"(?:(\d+)H)?"
        r"(?:(\d+)M)?"
        r"(?:(\d+)S)?$"
    )
    match = pattern.match(duration)
    if not match:
        return 0

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def get_video_categories(region_code: str = "US") -> dict:
    """
    Return mapping categoryId -> categoryName for a region.
    """
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY is not set in environment.")

    params = {
        "part": "snippet",
        "regionCode": region_code,
        "key": YOUTUBE_API_KEY,
    }
    url = f"{BASE_URL}/videoCategories"

    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    mapping = {}
    for item in data.get("items", []):
        cid = item.get("id")
        title = item.get("snippet", {}).get("title")
        if cid and title:
            mapping[cid] = title
    return mapping


def fetch_trending_videos(
    region: str = "US",
    max_results: int = 25
) -> pd.DataFrame:
    """
    Fetch trending (most popular) videos for a region using the YouTube Data API.
    """
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY is not set in environment.")

    max_results = max(1, min(max_results, 50))  # API limit is 50

    params = {
        "part": "snippet,contentDetails,statistics",
        "chart": "mostPopular",
        "regionCode": region,
        "maxResults": max_results,
        "key": YOUTUBE_API_KEY,
    }
    url = f"{BASE_URL}/videos"

    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        message = data["error"].get("message", "Unknown YouTube API error")
        raise RuntimeError(f"YouTube API error: {message}")

    items = data.get("items", [])
    if not items:
        return pd.DataFrame()

    # Get category mapping for human-readable names
    cat_map = get_video_categories(region_code=region)

    rows = []
    for item in items:
        vid = item.get("id")
        snippet = item.get("snippet", {})
        stats = item.get("statistics", {})
        content = item.get("contentDetails", {})

        category_id = snippet.get("categoryId", "")
        row = {
            "video_id": vid,
            "title": snippet.get("title", ""),
            "channel_title": snippet.get("channelTitle", ""),
            "category_id": category_id,
            "category_name": cat_map.get(category_id),
            "published_at": snippet.get("publishedAt", ""),
            "view_count": int(stats.get("viewCount", 0) or 0),
            "like_count": int(stats.get("likeCount", 0) or 0) if "likeCount" in stats else None,
            "comment_count": int(stats.get("commentCount", 0) or 0) if "commentCount" in stats else None,
            "duration_seconds": parse_iso8601_duration(content.get("duration", "")),
        }
        rows.append(row)

    df = pd.DataFrame(rows)
    return df


def compute_trending_metrics(df: pd.DataFrame, region: str) -> TrendingMetrics:
    if df.empty:
        return TrendingMetrics(
            region=region.upper(),
            total_videos=0,
            total_views=0,
            avg_views=0.0,
            median_views=0.0,
            top_channel_by_videos=None,
            top_channel_video_count=0,
            top_channel_by_views=None,
            top_channel_total_views=0,
        )

    total_views = int(df["view_count"].sum())
    avg_views = float(df["view_count"].mean())
    median_views = float(df["view_count"].median())

    # Top channel by number of trending videos
    channel_counts = df["channel_title"].value_counts()
    top_channel_by_videos = channel_counts.index[0]
    top_channel_video_count = int(channel_counts.iloc[0])

    # Top channel by total views in this trending set
    channel_views = df.groupby("channel_title")["view_count"].sum().sort_values(ascending=False)
    top_channel_by_views = channel_views.index[0]
    top_channel_total_views = int(channel_views.iloc[0])

    return TrendingMetrics(
        region=region.upper(),
        total_videos=len(df),
        total_views=total_views,
        avg_views=avg_views,
        median_views=median_views,
        top_channel_by_videos=top_channel_by_videos,
        top_channel_video_count=top_channel_video_count,
        top_channel_by_views=top_channel_by_views,
        top_channel_total_views=top_channel_total_views,
    )


# ===================== SIMPLE CHAT INTERPRETER =====================

REGION_MAP = {
    "india": "IN",
    "us": "US",
    "usa": "US",
    "united states": "US",
    "uk": "GB",
    "united kingdom": "GB",
    "germany": "DE",
    "france": "FR",
    "japan": "JP",
    "brazil": "BR",
}

def interpret_chat(message: str, default_region: Optional[str] = None, default_limit: Optional[int] = None):
    """
    Simple rule-based interpreter for trending dashboard commands.
    Examples:
      "Show trending in India"
      "Top 20 trending videos in US"
      "Create dashboard for Brazil trending"
    """
    text = message.strip()
    lower = text.lower()

    region = (default_region or "US").upper()
    limit = default_limit or 25

    # region detection
    for name, code in REGION_MAP.items():
        if name in lower:
            region = code
            break

    # detect a number as desired limit
    nums = re.findall(r"\b(\d{1,2})\b", text)
    for num_str in reversed(nums):
        try:
            n = int(num_str)
            if 1 <= n <= 50:
                limit = n
                break
        except ValueError:
            pass

    reply = (
        f"Okay, I’ll load the top {limit} trending YouTube videos for region {region}. "
        f"I’ll show basic metrics like total views, average views and the top channels."
    )

    return region, limit, reply


# ===================== FASTAPI APP =====================

app = FastAPI(
    title="YouTube Trending Analytics Assistant",
    version="0.1.0",
    description="Backend for YouTube trending dashboard + chat (educational, not official Google product).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://youtube-trending-analytics.netlify.app/",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/debug/env")
def debug_env():
    return {
        "YOUTUBE_API_KEY_present": YOUTUBE_API_KEY is not None,
        "YOUTUBE_API_KEY_length": len(YOUTUBE_API_KEY) if YOUTUBE_API_KEY else 0,
    }


@app.get("/api/trending", response_model=TrendingResponse)
def get_trending(
    region: str = Query("US", description="Region code, e.g. US, IN, GB"),
    limit: int = Query(25, ge=1, le=50, description="Number of trending videos to fetch (1–50)"),
):
    region = region.upper()

    try:
        df = fetch_trending_videos(region=region, max_results=limit)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="No trending videos found.")

    metrics = compute_trending_metrics(df, region=region)
    videos = [TrendingVideo(**row) for row in df.to_dict(orient="records")]

    return TrendingResponse(
        region=region,
        videos=videos,
        metrics=metrics,
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Chat endpoint that turns natural language into (region, limit)
    for the frontend dashboard.
    """
    region, limit, reply = interpret_chat(
        req.message,
        default_region=req.default_region,
        default_limit=req.default_limit,
    )
    return ChatResponse(
        reply=reply,
        region=region,
        limit=limit,
    )

