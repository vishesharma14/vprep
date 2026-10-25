# ml/: similar questions and question difficulty

Offline Python scripts. The ones that touch the database connect straight to Neon as its owner, so they run on your machine, never in the app or on Vercel.

| Script | What it does |
| ------ | ------------ |
| [`embed_questions.py`](embed_questions.py) | Embeds every question, of any status, with [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) and stores the 384-number vectors in `question_embeddings` (migration 0009). Only new and changed questions are embedded; `--force` embeds them all again. |
| [`evaluate_similarity.py`](evaluate_similarity.py) | Scores how often each published question's 3 nearest neighbours in its exam share its topic and subject (precision@3), for the stored embeddings against a TF-IDF baseline and chance. Writes the table to [`results.md`](results.md). |
| [`fit_difficulty.py`](fit_difficulty.py) | Fits a Rasch model to each learner's first answer to each question and replaces every row of `question_difficulty` (migration 0012) in one transaction. `--dry-run` prints the summary without writing. |
| [`simulate_difficulty.py`](simulate_difficulty.py) | No database: checks that the fit recovers known difficulties from simulated learners (30, 100 and 300), and writes the table to [`difficulty_results.md`](difficulty_results.md). |
| [`rasch.py`](rasch.py) | The Rasch model and its MAP fit, shared by the two above. Needs only NumPy and SciPy. |
| [`common.py`](common.py) | The database connection, and the text that gets embedded. |
| [`tests/`](tests/) | pytest tests for `rasch.py`; CI runs them with only NumPy, SciPy and pytest installed. |

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

python ml/fit_difficulty.py --dry-run  # fit and print, write nothing
python ml/fit_difficulty.py            # fit and replace question_difficulty
python ml/simulate_difficulty.py       # no database; writes ml/difficulty_results.md
python -m pytest ml/tests              # no database
```

`embed_questions.py` prints how many questions it embedded, skipped and looked at:

```
Embedded: 4
Skipped:  212 (unchanged, 3 marked up to date)
Total:    216
```

Run it after adding, importing or editing questions. The admin **Overview** shows how many questions are missing an embedding or changed since theirs was made. Until a question has one, it gets no similar questions and appears in no one else's.

## Question difficulty

`fit_difficulty.py` uses each learner's **first** attempt at each question: solved alone counts as right, wrong or revealed as wrong, and a first attempt with a hint or skipped is left out. Later attempts come after the learner has seen the answer and explanation, so they would make questions look easier than they are. It prints the learners, the first answers used, the questions fitted, how many got a level (a level needs 20 first answers), and a table of the level set against the level estimated:

```
Learners:         1
Responses:        11 first answers (2 right, 9 wrong or revealed)
Left out:         6 first attempts with a hint or skipped
Questions fitted: 11 of 216 (converged in 10 iterations)
With a level:     0 (a level needs 20 first answers)
Mismatches:       0 of 0 with a level differ from the level set

Set \ Data        easy    medium      hard  no level
easy                 0         0         0       121
medium               0         0         0        85
hard                 0         0         0        10
```

Run it again as answers come in: the estimates don't update on their own. The model, the priors, the levels and the simulation results are explained in the main [README](../README.md#data-driven-question-difficulty).
