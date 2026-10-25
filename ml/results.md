# Similar questions: evaluation

Made by [`evaluate_similarity.py`](evaluate_similarity.py) on 2026-10-25 13:36 UTC.

**Setup.** 216 published questions in 7 exams. For each one, the 3 nearest other published questions in the same exam, most similar first, as `similar_questions()` picks them for a signed-out learner (but without its similarity cut-off, so every method is judged on 3 neighbours). Every method reads the same text: the question and its options, not the topic name.

- **MiniLM**: the stored embeddings (`sentence-transformers/all-MiniLM-L6-v2`), by cosine similarity.
- **TF-IDF**: word TF-IDF (sublinear term frequency, English stop words removed) fitted here on the same questions, by cosine similarity.
- **Chance**: what 3 random questions from the same exam would score.

**Precision@3** is the share of a question's 3 neighbours in its topic (or its subject), averaged over the questions.

| Method | Precision@3, same topic | Precision@3, same subject |
| --- | ---: | ---: |
| Chance (random questions from the same exam) | 19.7% | 43.9% |
| TF-IDF baseline | 76.1% | 90.4% |
| MiniLM embeddings | 92.1% | 96.9% |

In the app (similarity ≥ 0.3), MiniLM suggests at least one question for 213 of 216 questions (98.6%), 2.8 on average. Of the suggestions shown, 93.1% are in the same topic and 97.4% in the same subject.
