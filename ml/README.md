# ml/: embeddings for similar questions

Two offline Python scripts. They connect straight to the Neon database as its owner, so they run on your machine, never in the app or on Vercel.

| Script | What it does |
| ------ | ------------ |
| [`embed_questions.py`](embed_questions.py) | Embeds every question, of any status, with [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) and stores the 384-number vectors in `question_embeddings` (migration 0009). Only new and changed questions are embedded; `--force` embeds them all again. |
| [`evaluate_similarity.py`](evaluate_similarity.py) | Scores how often each published question's 3 nearest neighbours in its exam share its topic and subject (precision@3), for the stored embeddings against a TF-IDF baseline and chance. Writes the table to [`results.md`](results.md). |
| [`common.py`](common.py) | Shared by both: the database connection and the text that gets embedded. |

## What gets embedded

The question's text, then each option on its own line. Not the topic name, so the evaluation can check whether questions from the same topic find each other on their own.

Each row stores `content_hash`: the md5 of the model name and that text. When a question's text or options change, or the model does, the hash no longer matches and the next run embeds it again. Other edits (status, topic, tags) leave the text alone: the run only marks those up to date, so the admin Overview stops counting them as stale.

## Set up (once)

Needs Python 3.10 or later. From the project folder:

```bash
python -m venv ml/.venv

# Windows (PowerShell)
ml\.venv\Scripts\Activate.ps1
# macOS / Linux
source ml/.venv/bin/activate

pip install -r ml/requirements.txt
```

Then copy [`.env.example`](.env.example) to `ml/.env` and set `DATABASE_URL` to the Neon connection string (Neon Console -> your project -> **Connect**, the owner role). `ml/.env` is gitignored: never commit it. The scripts read it themselves and never print it.

The first run downloads the model (about 90 MB) into the Hugging Face cache; later runs use the cached copy. On Windows, Hugging Face may warn that symlinks aren't supported and that no `HF_TOKEN` is set. Both are harmless: the cache just takes a little more disk space, and the model is public.

## Run

With the venv active, from the project folder:

```bash
python ml/embed_questions.py           # new and changed questions only
python ml/embed_questions.py --force   # every question again
python ml/evaluate_similarity.py       # writes ml/results.md
```

`embed_questions.py` prints how many questions it embedded, skipped and looked at:

```
Embedded: 4
Skipped:  212 (unchanged, 3 marked up to date)
Total:    216
```

Run it after adding, importing or editing questions. The admin **Overview** shows how many questions are missing an embedding or changed since theirs was made. Until a question has one, it gets no similar questions and appears in no one else's.
