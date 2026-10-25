"""Shared by the scripts in ml/: the database connection and the text that gets embedded."""

import hashlib
import os
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from dotenv import load_dotenv

ML_DIR = Path(__file__).resolve().parent

# 384 dimensions, matching question_embeddings.embedding (migration 0009).
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DIMENSIONS = 384


def question_text(body: str, options: list[str]) -> str:
    """What gets embedded: the question, then each option on its own line. Not the topic name."""
    return "\n".join([body.strip(), *(option.strip() for option in options)])


def content_hash(text: str, model: str = MODEL) -> str:
    """md5 of the model name and the text, so a new model or a changed question is embedded again."""
    return hashlib.md5(f"{model}\n{text}".encode("utf-8")).hexdigest()


def _redact(message: str, url: str) -> str:
    secrets = [url]
    try:
        password = urlsplit(url).password
    except ValueError:
        password = None
    if password:
        secrets.append(password)
    for secret in secrets:
        message = message.replace(secret, "***")
    return message


def connect() -> psycopg.Connection:
    """
    Connects with DATABASE_URL from ml/.env (or the environment). Never prints
    the URL: a failed connection's message is shown with it blanked out.
    """
    load_dotenv(ML_DIR / ".env")
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("DATABASE_URL is not set. Copy ml/.env.example to ml/.env and fill it in.")
    try:
        return psycopg.connect(url, connect_timeout=20)
    except psycopg.Error as err:
        raise SystemExit(f"Couldn't connect to the database: {_redact(str(err), url)}") from None
