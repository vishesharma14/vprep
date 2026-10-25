"""
Fits the Rasch model (rasch.py) to learners' first answers and replaces every
row of question_difficulty with the estimates, for the admin panel.

    python fit_difficulty.py [--dry-run]

--dry-run fits and prints the same summary without writing anything.
"""

import argparse
from collections import Counter

import rasch
from common import connect

# Each learner's first attempt at each question, of any status. Only the first
# counts: every attempt is followed by the correct answer and its explanation
# (in the feedback after answering, or on the summary at the end of the
# session, skipped questions included), so a later attempt measures whether
# the learner remembers them, not how hard the question is.
FIRST_ANSWERS_SQL = """
select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.status
from public.attempts a
order by a.user_id, a.question_id, a.created_at, a.id
"""

# Solved alone is right; wrong or revealed is wrong. A first attempt with a
# hint (helped, so not a fair test) or skipped (no answer given) is left out,
# and not replaced by the learner's next attempt, which came after the answer.
SCORE = {"independent": 1, "incorrect": 0, "revealed": 0}

QUESTIONS_SQL = "select id, difficulty from public.questions"

DELETE_SQL = "delete from public.question_difficulty"

INSERT_SQL = """
insert into public.question_difficulty
  (question_id, model, difficulty, std_error, responses, correct_rate, p_average, level)
values (%s, %s, %s, %s, %s, %s, %s, %s)
"""

LEVELS = ["easy", "medium", "hard"]


def print_table(set_levels: dict, estimated: dict) -> None:
    """Every question, by the level set (rows) and the level the data gives it (columns)."""
    counts = Counter((set_level, estimated.get(question_id)) for question_id, set_level in set_levels.items())
    columns = [*LEVELS, None]
    print("Set \\ Data".ljust(12) + "".join(f"{level or 'no level':>10}" for level in columns))
    for set_level in LEVELS:
        print(set_level.ljust(12) + "".join(f"{counts[set_level, level]:>10}" for level in columns))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="fit and print, but write nothing")
    args = parser.parse_args()

    with connect() as conn:
        first = conn.execute(FIRST_ANSWERS_SQL).fetchall()
        set_levels = dict(conn.execute(QUESTIONS_SQL).fetchall())

        scored = [(user_id, question_id, SCORE[status]) for user_id, question_id, status in first if status in SCORE]
        learner_ids = sorted({user_id for user_id, _, _ in scored})
        question_ids = sorted({question_id for _, question_id, _ in scored})
        learner_index = {user_id: i for i, user_id in enumerate(learner_ids)}
        question_index = {question_id: i for i, question_id in enumerate(question_ids)}

        rows = []
        iterations = 0
        if scored:
            try:
                fit = rasch.fit(
                    [learner_index[user_id] for user_id, _, _ in scored],
                    [question_index[question_id] for _, question_id, _ in scored],
                    [score for _, _, score in scored],
                    len(learner_ids),
                    len(question_ids),
                )
            except RuntimeError as err:
                raise SystemExit(f"{err}. Nothing was written.") from None
            iterations = fit.iterations
            rows = [
                (
                    question_id,
                    rasch.MODEL,
                    float(fit.difficulty[i]),
                    float(fit.std_error[i]),
                    int(fit.responses[i]),
                    float(fit.correct_rate[i]),
                    float(fit.p_average[i]),
                    fit.level[i],
                )
                for i, question_id in enumerate(question_ids)
            ]

        if not args.dry_run:
            conn.execute(DELETE_SQL)
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, rows)
        # Leaving the block commits the delete and the inserts together.

    estimated = {row[0]: row[7] for row in rows}
    with_level = sum(1 for level in estimated.values() if level is not None)
    mismatches = sum(1 for question_id, level in estimated.items() if level and level != set_levels[question_id])
    solved = sum(score for _, _, score in scored)

    print(f"Learners:         {len(learner_ids)}")
    print(f"Responses:        {len(scored)} first answers ({solved} right, {len(scored) - solved} wrong or revealed)")
    print(f"Left out:         {len(first) - len(scored)} first attempts with a hint or skipped")
    converged = f" (converged in {iterations} iterations)" if rows else ""
    print(f"Questions fitted: {len(rows)} of {len(set_levels)}{converged}")
    print(f"With a level:     {with_level} (a level needs {rasch.MIN_RESPONSES} first answers)")
    print(f"Mismatches:       {mismatches} of {with_level} with a level differ from the level set")
    print()
    print_table(set_levels, estimated)
    print()
    if args.dry_run:
        print("Dry run: nothing written.")
    else:
        print(f"Replaced question_difficulty with {len(rows)} rows (model {rasch.MODEL}).")


if __name__ == "__main__":
    main()
