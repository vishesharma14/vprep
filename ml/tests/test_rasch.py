"""Tests for rasch.py. Need only numpy, scipy and pytest: no database."""

import numpy as np
import pytest
from scipy.special import expit
from scipy.stats import pearsonr

import rasch
from simulate_difficulty import simulate

SMALL_BANK = {"easy": 24, "medium": 18, "hard": 6}


def fit_simulation(n_learners: int, seed: int):
    sim = simulate(n_learners, seed, SMALL_BANK)
    return sim, rasch.fit(sim.learners, sim.questions, sim.correct, len(sim.ability), len(sim.labels))


def test_recovers_true_difficulty_with_300_learners():
    sim, fit = fit_simulation(300, seed=7)
    assert pearsonr(sim.difficulty, fit.difficulty).statistic > 0.85


def test_gradient_matches_finite_differences():
    rng = np.random.default_rng(0)
    n_learners, n_questions, n_responses = 6, 5, 40
    learners = rng.integers(0, n_learners, n_responses)
    questions = rng.integers(0, n_questions, n_responses)
    correct = rng.integers(0, 2, n_responses).astype(np.float64)
    params = rng.normal(0, 1.5, n_learners + n_questions)

    def value(x):
        return rasch.neg_log_posterior(x, learners, questions, correct, n_learners)[0]

    _, gradient = rasch.neg_log_posterior(params, learners, questions, correct, n_learners)
    step = 1e-6
    numeric = np.array([(value(params + step * e) - value(params - step * e)) / (2 * step) for e in np.eye(len(params))])
    np.testing.assert_allclose(gradient, numeric, rtol=1e-6, atol=1e-6)


def test_standard_error_and_p_average_follow_their_formulas():
    sim, fit = fit_simulation(40, seed=1)
    p = expit(fit.ability[sim.learners] - fit.difficulty[sim.questions])
    information = np.bincount(sim.questions, weights=p * (1 - p), minlength=len(sim.labels)) + 1 / 2**2
    np.testing.assert_allclose(fit.std_error, 1 / np.sqrt(information))
    np.testing.assert_allclose(fit.p_average, expit(-fit.difficulty))


@pytest.mark.parametrize(
    ("p_average", "expected"),
    [(0.95, "easy"), (0.7, "easy"), (0.6999, "medium"), (0.5, "medium"), (0.4, "medium"), (0.3999, "hard"), (0.02, "hard")],
)
def test_level_thresholds(p_average, expected):
    assert rasch.level(p_average, 20) == expected


def test_no_level_below_20_responses():
    assert rasch.level(0.95, 19) is None
    assert rasch.level(0.02, 0) is None
    assert rasch.level(0.95, 20) == "easy"
    assert rasch.level(0.02, 500) == "hard"


def test_fitted_levels_follow_the_thresholds_and_the_20_response_rule():
    # About 18 answers per question, so some reach 20 and some don't.
    _, fit = fit_simulation(60, seed=3)
    for p_average, responses, level in zip(fit.p_average, fit.responses, fit.level):
        if responses < 20:
            assert level is None
        else:
            assert level == ("easy" if p_average >= 0.7 else "hard" if p_average < 0.4 else "medium")
    assert None in fit.level
    assert any(level is not None for level in fit.level)
