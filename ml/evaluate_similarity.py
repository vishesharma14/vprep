"""
Checks how well the stored embeddings find related questions, against a
TF-IDF baseline on the same text, and writes the table to ml/results.md.

For every published question with an embedding, takes its 3 nearest other
published questions in the same exam, most similar first (as
similar_questions() picks them for a signed-out learner), and scores the share
in the same topic and in the same subject: precision@3.

    python evaluate_similarity.py
"""

import json
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from common import ML_DIR, connect, content_hash, question_text

K = 3
# similar_questions() drops matches below this (its p_min_similarity default).
APP_MIN_SIMILARITY = 0.3
RESULTS = ML_DIR / "results.md"

QUESTIONS_SQL = """
select q.code, q.body, q.options, q.topic_id, t.subject_id, s.exam_id,
       e.model, e.content_hash, e.embedding::text
from public.questions q
join public.topics t on t.id = q.topic_id
join public.subjects s on s.id = t.subject_id
left join public.question_embeddings e on e.question_id = q.id
where q.status = 'published'
order by q.code
"""


def nearest(similarity: np.ndarray, exams: list, codes: list[str], k: int = K) -> list[list[int]]:
    """For each question, its k most similar others in the same exam: most similar first, then by code."""
    result = []
    for i in range(len(codes)):
        others = [j for j in range(len(codes)) if j != i and exams[j] == exams[i]]
        others.sort(key=lambda j: (-similarity[i, j], codes[j]))
        result.append(others[:k])
    return result


def precision(neighbours: list[list[int]], labels: list) -> float:
    """The share of each question's neighbours with its label, averaged over questions that have any."""
    scores = [sum(labels[j] == labels[i] for j in js) / len(js) for i, js in enumerate(neighbours) if js]
    return float(np.mean(scores)) if scores else float("nan")


def chance(exams: list, labels: list) -> float:
    """What random questions from the same exam would score: the share of the exam's other questions with the label."""
    scores = []
    for i in range(len(exams)):
        others = [j for j in range(len(exams)) if j != i and exams[j] == exams[i]]
        if others:
            scores.append(sum(labels[j] == labels[i] for j in others) / len(others))
    return float(np.mean(scores)) if scores else float("nan")


def percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def main() -> None:
    with connect() as conn:
        rows = conn.execute(QUESTIONS_SQL).fetchall()

    missing = sum(1 for row in rows if row[8] is None)
    rows = [row for row in rows if row[8] is not None]
    if len(rows) < 2:
        raise SystemExit("Fewer than 2 published questions have an embedding. Run embed_questions.py first.")

    codes = [row[0] for row in rows]
    texts = [question_text(row[1], row[2]) for row in rows]
    topics = [row[3] for row in rows]
    subjects = [row[4] for row in rows]
    exams = [row[5] for row in rows]
    models = sorted({row[6] for row in rows})
    stale = sum(1 for row, text in zip(rows, texts) if row[7] != content_hash(text, row[6]))

    embeddings = np.array([json.loads(row[8]) for row in rows], dtype=np.float64)
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
    minilm_similarity = embeddings @ embeddings.T

    tfidf = TfidfVectorizer(sublinear_tf=True, stop_words="english").fit_transform(texts)
    tfidf_similarity = (tfidf @ tfidf.T).toarray()

    minilm = nearest(minilm_similarity, exams, codes)
    tfidf_nearest = nearest(tfidf_similarity, exams, codes)
    table = [
        ("Chance (random questions from the same exam)", chance(exams, topics), chance(exams, subjects)),
        ("TF-IDF baseline", precision(tfidf_nearest, topics), precision(tfidf_nearest, subjects)),
        ("MiniLM embeddings", precision(minilm, topics), precision(minilm, subjects)),
    ]

    # What learners see: the same neighbours, without the weak ones.
    shown = [[j for j in js if minilm_similarity[i, j] >= APP_MIN_SIMILARITY] for i, js in enumerate(minilm)]
    with_any = sum(1 for js in shown if js)
    average_shown = sum(len(js) for js in shown) / len(shown)

    no_others = sum(1 for js in minilm if not js)
    fewer = sum(1 for js in minilm if 0 < len(js) < K)
    scored = len(rows) - no_others

    table_lines = [
        f"| Method | Precision@{K}, same topic | Precision@{K}, same subject |",
        "| --- | ---: | ---: |",
        *(f"| {name} | {percent(topic)} | {percent(subject)} |" for name, topic, subject in table),
    ]
    app_line = (
        f"In the app (similarity >= {APP_MIN_SIMILARITY}), MiniLM suggests at least one question for "
        f"{with_any} of {len(rows)} questions ({percent(with_any / len(rows))}), {average_shown:.1f} on average. "
        f"Of the suggestions shown, {percent(precision(shown, topics))} are in the same topic and "
        f"{percent(precision(shown, subjects))} in the same subject."
    )

    notes = []
    if fewer:
        notes.append(f"{fewer} questions have fewer than {K} others in their exam and are scored on the ones they have.")
    if no_others:
        notes.append(f"{no_others} questions are the only one in their exam and are left out.")
    if missing:
        notes.append(f"{missing} published questions have no embedding yet and are left out.")
    if stale:
        notes.append(f"{stale} questions changed since they were embedded. Run embed_questions.py for exact results.")

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    RESULTS.write_text(
        "\n".join(
            [
                "# Similar questions: evaluation",
                "",
                f"Made by [`evaluate_similarity.py`](evaluate_similarity.py) on {generated}.",
                "",
                f"**Setup.** {scored} published questions in {len(set(exams))} exams. For each one, the {K} nearest "
                "other published questions in the same exam, most similar first, as `similar_questions()` picks "
                "them for a signed-out learner (but without its similarity cut-off, so every method is judged on "
                f"{K} neighbours). Every method reads the same text: the question and its options, not the topic name.",
                "",
                f"- **MiniLM**: the stored embeddings ({', '.join(f'`{m}`' for m in models)}), by cosine similarity.",
                "- **TF-IDF**: word TF-IDF (sublinear term frequency, English stop words removed) fitted here on "
                "the same questions, by cosine similarity.",
                f"- **Chance**: what {K} random questions from the same exam would score.",
                "",
                f"**Precision@{K}** is the share of a question's {K} neighbours in its topic (or its subject), "
                "averaged over the questions.",
                "",
                *table_lines,
                "",
                app_line.replace(">=", "≥"),
                *(["", *(f"- {note}" for note in notes)] if notes else []),
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"{scored} published questions scored, in {len(set(exams))} exams (model: {', '.join(models)}).")
    for note in notes:
        print(f"Note: {note}")
    print()
    print("\n".join(table_lines))
    print()
    print(app_line)
    print(f"\nWrote {RESULTS.relative_to(ML_DIR.parent)}")


if __name__ == "__main__":
    main()
