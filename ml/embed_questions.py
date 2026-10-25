"""
Embeds every question (any status) with all-MiniLM-L6-v2 and stores the
vectors in question_embeddings, for similar_questions() and the admin panel.

Only new and changed questions are embedded: a question is skipped when its
stored content_hash matches. --force embeds them all again.

    python embed_questions.py [--force]
"""

import argparse

from common import DIMENSIONS, MODEL, connect, content_hash, question_text

QUESTIONS_SQL = """
select q.id, q.body, q.options, e.content_hash, e.updated_at < q.updated_at as behind
from public.questions q
left join public.question_embeddings e on e.question_id = q.id
order by q.code
"""

UPSERT_SQL = """
insert into public.question_embeddings (question_id, model, content_hash, embedding, updated_at)
values (%s, %s, %s, %s::public.vector, now())
on conflict (question_id) do update
set model = excluded.model,
    content_hash = excluded.content_hash,
    embedding = excluded.embedding,
    updated_at = now()
"""

# Any update to a question (a new status, topic or tag) moves its updated_at,
# so admin_embedding_status() counts it as stale even when the embedded text
# is the same. Those only need their updated_at moved on.
TOUCH_SQL = "update public.question_embeddings set updated_at = now() where question_id = any(%s)"


def vector_literal(values) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="embed every question again, changed or not")
    args = parser.parse_args()

    with connect() as conn:
        rows = conn.execute(QUESTIONS_SQL).fetchall()

        to_embed = []  # (id, text, hash)
        to_touch = []
        for question_id, body, options, stored_hash, behind in rows:
            text = question_text(body, options)
            digest = content_hash(text)
            if args.force or stored_hash != digest:
                to_embed.append((question_id, text, digest))
            elif behind:
                to_touch.append(question_id)

        if to_embed:
            # Imported here: loading PyTorch takes a few seconds, and isn't needed when nothing changed.
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(MODEL)
            if model.get_embedding_dimension() != DIMENSIONS:
                raise SystemExit(f"{MODEL} doesn't make {DIMENSIONS}-dimensional vectors.")
            vectors = model.encode(
                [text for _, text, _ in to_embed],
                batch_size=64,
                normalize_embeddings=True,
                show_progress_bar=len(to_embed) > 64,
            )
            with conn.cursor() as cur:
                cur.executemany(
                    UPSERT_SQL,
                    [
                        (question_id, MODEL, digest, vector_literal(vector))
                        for (question_id, _, digest), vector in zip(to_embed, vectors)
                    ],
                )
        if to_touch:
            conn.execute(TOUCH_SQL, (to_touch,))
        # Leaving the block commits.

    skipped = len(rows) - len(to_embed)
    print(f"Embedded: {len(to_embed)}")
    print(f"Skipped:  {skipped} (unchanged{f', {len(to_touch)} marked up to date' if to_touch else ''})")
    print(f"Total:    {len(rows)}")


if __name__ == "__main__":
    main()
