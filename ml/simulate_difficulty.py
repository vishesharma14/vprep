"""
Parameter recovery for the Rasch fit, with no database: simulates learners
answering questions whose true difficulty is known, fits rasch.py to their
answers as fit_difficulty.py does, and measures how close the estimates come.
Writes the table to ml/difficulty_results.md.

    python simulate_difficulty.py
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.special import expit
from scipy.stats import pearsonr, spearmanr

import rasch

ML_DIR = Path(__file__).resolve().parent
RESULTS = ML_DIR / "difficulty_results.md"

# The real bank's set levels (216 published questions, October 2026).
LABEL_COUNTS = {"easy": 121, "medium": 85, "hard": 10}
# True difficulty ~ N(label - 1, LABEL_SPREAD^2): around -1, 0 and +1 logits.
LABEL_NUMBER = {"easy": 0, "medium": 1, "hard": 2}
LABEL_SPREAD = 0.5
ANSWERED_SHARE = 0.3

LEARNER_COUNTS = (30, 100, 300)
SEEDS = (1, 2, 3, 4, 5)


@dataclass(frozen=True)
class Simulation:
    labels: list[str]
    difficulty: np.ndarray
    ability: np.ndarray
    learners: np.ndarray
    questions: np.ndarray
    correct: np.ndarray


def make_questions(seed: int, label_counts: dict[str, int] = LABEL_COUNTS) -> tuple[list[str], np.ndarray]:
    """Each question's set level and true difficulty. They depend only on the seed, not on the learners."""
    labels = [label for label, count in label_counts.items() for _ in range(count)]
    centre = np.array([LABEL_NUMBER[label] - 1 for label in labels], dtype=np.float64)
    return labels, np.random.default_rng(seed).normal(centre, LABEL_SPREAD)


def simulate(n_learners: int, seed: int, label_counts: dict[str, int] = LABEL_COUNTS) -> Simulation:
    """Learners with abilities ~ N(0, 1), each answering a random ANSWERED_SHARE of the questions once."""
    labels, difficulty = make_questions(seed, label_counts)
    rng = np.random.default_rng([seed, n_learners])
    ability = rng.normal(0, 1, n_learners)
    per_learner = round(ANSWERED_SHARE * len(labels))
    chosen = np.argsort(rng.random((n_learners, len(labels))), axis=1)[:, :per_learner]
    learners = np.repeat(np.arange(n_learners), per_learner)
    questions = chosen.ravel()
    correct = (rng.random(len(questions)) < expit(ability[learners] - difficulty[questions])).astype(np.float64)
    return Simulation(labels, difficulty, ability, learners, questions, correct)


def true_levels(difficulty: np.ndarray) -> list[str]:
    """The level each question would get from its exact difficulty, however few its answers."""
    return [rasch.level(float(p), rasch.MIN_RESPONSES) for p in expit(-difficulty)]


def recovery(sim: Simulation) -> dict[str, float]:
    fit = rasch.fit(sim.learners, sim.questions, sim.correct, len(sim.ability), len(sim.labels))
    answered = fit.responses > 0
    true, estimate, se = sim.difficulty[answered], fit.difficulty[answered], fit.std_error[answered]
    truth = true_levels(sim.difficulty)
    with_level = [i for i, level in enumerate(fit.level) if level is not None]
    return {
        "answers": float(fit.responses.mean()),
        "pearson": float(pearsonr(true, estimate).statistic),
        "spearman": float(spearmanr(true, estimate).statistic),
        "rmse": float(np.sqrt(np.mean((estimate - true) ** 2))),
        "with_level": len(with_level) / len(sim.labels),
        "level_accuracy": float(np.mean([fit.level[i] == truth[i] for i in with_level])) if with_level else np.nan,
        "se": float(se.mean()),
        "coverage": float(np.mean(np.abs(estimate - true) <= 1.96 * se)),
    }


def mean(values: list[float]) -> float:
    """The mean of the values that aren't NaN; NaN if none are."""
    present = [v for v in values if not np.isnan(v)]
    return float(np.mean(present)) if present else np.nan


def and_list(items) -> str:
    """"30", "30 and 100", "30, 100 and 300"."""
    words = [str(item) for item in items]
    return words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"


def percent(value: float) -> str:
    return "—" if np.isnan(value) else f"{value * 100:.1f}%"


def main() -> None:
    rows = []
    for n_learners in LEARNER_COUNTS:
        runs = [recovery(simulate(n_learners, seed)) for seed in SEEDS]
        rows.append((n_learners, {key: mean([run[key] for run in runs]) for key in runs[0]}))

    # How often the set label is the level the true difficulty gives: the most an estimate could agree with it.
    label_agreement = mean(
        [
            float(np.mean([truth == label for truth, label in zip(true_levels(difficulty), labels)]))
            for labels, difficulty in map(make_questions, SEEDS)
        ]
    )

    n_questions = sum(LABEL_COUNTS.values())
    table_lines = [
        "| Learners | First answers per question | Pearson r | Spearman ρ | RMSE | With a level | Level accuracy "
        "| Mean SE | 95% coverage |",
        "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        *(
            f"| {n} | {r['answers']:.1f} | {r['pearson']:.3f} | {r['spearman']:.3f} | {r['rmse']:.3f} "
            f"| {percent(r['with_level'])} | {percent(r['level_accuracy'])} | {r['se']:.3f} | {percent(r['coverage'])} |"
            for n, r in rows
        ),
    ]
    agreement_line = (
        f"Set levels and true difficulty overlap by design (sd {LABEL_SPREAD} around each level), so even the exact "
        f"difficulties give {percent(label_agreement)} of questions their set level. A mismatch in the admin panel is "
        "a reason to look at the question, not proof that its level is wrong."
    )

    notes = []
    no_level = [n for n, r in rows if r["with_level"] == 0]
    if no_level:
        notes.append(
            f"With {and_list(no_level)} learners, no question reaches the {rasch.MIN_RESPONSES} first "
            "answers a level needs, so there is no level accuracy."
        )
    narrow = [n for n, r in rows if r["coverage"] < 0.94]
    if narrow:
        per_learner = round(ANSWERED_SHARE * n_questions)
        notes.append(
            f"Coverage falls a little short of 95% with {and_list(narrow)} learners: the standard error "
            f"holds each learner's ability fixed at its estimate, which comes from only {per_learner} answers, so it "
            "leaves out that uncertainty and the intervals are slightly too narrow."
        )
    notes.append(agreement_line)

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    label_text = ", ".join(f"{count} {label}" for label, count in LABEL_COUNTS.items())
    RESULTS.write_text(
        "\n".join(
            [
                "# Question difficulty: parameter recovery",
                "",
                f"Made by [`simulate_difficulty.py`](simulate_difficulty.py) on {generated}.",
                "",
                f"**Setup.** {n_questions} questions with the real bank's set levels ({label_text}). Each question's "
                f"true difficulty is drawn from N(label − 1, {LABEL_SPREAD}²), with easy = 0, medium = 1 and hard = 2, "
                "so it sits around −1, 0 or +1 logits, and each learner's ability from N(0, 1). Every learner answers "
                f"a random {ANSWERED_SHARE:.0%} of the questions once, correctly with probability "
                "σ(ability − difficulty). [`rasch.py`](rasch.py) is fitted to those answers as "
                "[`fit_difficulty.py`](fit_difficulty.py) fits the real ones. Each number is the mean over seeds "
                f"{SEEDS[0]}–{SEEDS[-1]}.",
                "",
                "- **Pearson r** and **Spearman ρ**: correlation between true and estimated difficulty, and between "
                "their ranks.",
                "- **RMSE**: root mean squared error of the estimates, in logits.",
                f"- **With a level**: questions with at least {rasch.MIN_RESPONSES} first answers, which get a level.",
                "- **Level accuracy**: of those, the share given the level their true difficulty gives (easy when an "
                f"average learner's chance σ(−difficulty) is at least {rasch.EASY_FROM}, hard below "
                f"{rasch.HARD_BELOW}).",
                "- **Mean SE** and **95% coverage**: the average standard error, and how often the true difficulty "
                "is within 1.96 standard errors of the estimate.",
                "",
                *table_lines,
                "",
                *(f"- {note}" for note in notes),
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"{n_questions} questions, {len(SEEDS)} seeds, {ANSWERED_SHARE:.0%} answered by each learner.")
    print()
    # ASCII here: a Windows console may not be able to print ρ or the dash.
    print("\n".join(table_lines).replace("ρ", "rho").replace("—", "-"))
    print()
    for note in notes:
        print(f"Note: {note}")
    print(f"\nWrote {RESULTS.relative_to(ML_DIR.parent)}")


if __name__ == "__main__":
    main()
