"""
The Rasch model (1-parameter IRT) behind data-driven question difficulty.
Shared by fit_difficulty.py, simulate_difficulty.py and the tests, so it needs
only numpy and scipy: no database.

    P(correct) = sigmoid(ability[learner] - difficulty[question])

Fitted by MAP: the most likely abilities and difficulties given the answers
and the priors ability ~ N(0, 1), difficulty ~ N(0, 2^2). The ability prior
pins the scale: a difficulty of 0 means an average learner has a 50% chance.
"""

from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

# Written to question_difficulty.model. A new name for any change to the model or its priors.
MODEL = "rasch-map-v1"

ABILITY_SD = 1.0
DIFFICULTY_SD = 2.0

# A question gets a level only from this many responses.
MIN_RESPONSES = 20
# p_average, the chance an average learner gets it right: easy from 0.7, hard below 0.4.
EASY_FROM = 0.7
HARD_BELOW = 0.4


@dataclass(frozen=True)
class Fit:
    """Estimates per learner and per question, in the order of their indices."""

    ability: np.ndarray
    difficulty: np.ndarray
    std_error: np.ndarray
    responses: np.ndarray
    correct_rate: np.ndarray
    p_average: np.ndarray
    level: list[str | None]
    iterations: int


def level(p_average: float, responses: int) -> str | None:
    """easy / medium / hard from the chance an average learner gets it right; None below MIN_RESPONSES."""
    if responses < MIN_RESPONSES:
        return None
    if p_average >= EASY_FROM:
        return "easy"
    if p_average < HARD_BELOW:
        return "hard"
    return "medium"


def neg_log_posterior(
    params: np.ndarray,
    learners: np.ndarray,
    questions: np.ndarray,
    correct: np.ndarray,
    n_learners: int,
) -> tuple[float, np.ndarray]:
    """
    The negative log posterior (up to a constant) and its gradient. `params` is
    every learner's ability, then every question's difficulty; response i is
    learner learners[i] answering question questions[i], correct[i] 1 or 0.
    """
    ability = params[:n_learners]
    difficulty = params[n_learners:]
    logit = ability[learners] - difficulty[questions]

    # -log P(answer) = log(1 + e^logit) - correct * logit, without overflow.
    value = np.sum(np.logaddexp(0.0, logit) - correct * logit)
    value += np.sum(ability**2) / (2 * ABILITY_SD**2) + np.sum(difficulty**2) / (2 * DIFFICULTY_SD**2)

    # d/dlogit is p - correct; the logit rises with ability and falls with difficulty.
    residual = expit(logit) - correct
    grad_ability = np.bincount(learners, weights=residual, minlength=n_learners) + ability / ABILITY_SD**2
    grad_difficulty = (
        -np.bincount(questions, weights=residual, minlength=len(difficulty)) + difficulty / DIFFICULTY_SD**2
    )
    return float(value), np.concatenate([grad_ability, grad_difficulty])


def fit(learners, questions, correct, n_learners: int, n_questions: int) -> Fit:
    """
    Fits the model with L-BFGS. Learners and questions are indices from 0;
    one with no responses is left at its prior mean. Raises RuntimeError if the
    optimiser doesn't converge.
    """
    learners = np.asarray(learners, dtype=np.intp)
    questions = np.asarray(questions, dtype=np.intp)
    correct = np.asarray(correct, dtype=np.float64)

    result = minimize(
        neg_log_posterior,
        np.zeros(n_learners + n_questions),
        args=(learners, questions, correct, n_learners),
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 2000, "gtol": 1e-6},
    )
    if not result.success:
        raise RuntimeError(f"The fit didn't converge: {result.message}")

    ability = result.x[:n_learners]
    difficulty = result.x[n_learners:]
    p = expit(ability[learners] - difficulty[questions])

    # The curvature of the posterior in each difficulty, abilities held fixed.
    information = np.bincount(questions, weights=p * (1 - p), minlength=n_questions) + 1 / DIFFICULTY_SD**2
    responses = np.bincount(questions, minlength=n_questions)
    correct_rate = np.divide(
        np.bincount(questions, weights=correct, minlength=n_questions),
        responses,
        out=np.zeros(n_questions),
        where=responses > 0,
    )
    p_average = expit(-difficulty)

    return Fit(
        ability=ability,
        difficulty=difficulty,
        std_error=1 / np.sqrt(information),
        responses=responses,
        correct_rate=correct_rate,
        p_average=p_average,
        level=[level(float(p), int(n)) for p, n in zip(p_average, responses)],
        iterations=int(result.nit),
    )
