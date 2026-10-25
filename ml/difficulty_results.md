# Question difficulty: parameter recovery

Made by [`simulate_difficulty.py`](simulate_difficulty.py) on 2026-10-25 16:50 UTC.

**Setup.** 216 questions with the real bank's set levels (121 easy, 85 medium, 10 hard). Each question's true difficulty is drawn from N(label − 1, 0.5²), with easy = 0, medium = 1 and hard = 2, so it sits around −1, 0 or +1 logits, and each learner's ability from N(0, 1). Every learner answers a random 30% of the questions once, correctly with probability σ(ability − difficulty). [`rasch.py`](rasch.py) is fitted to those answers as [`fit_difficulty.py`](fit_difficulty.py) fits the real ones. Each number is the mean over seeds 1–5.

- **Pearson r** and **Spearman ρ**: correlation between true and estimated difficulty, and between their ranks.
- **RMSE**: root mean squared error of the estimates, in logits.
- **With a level**: questions with at least 20 first answers, which get a level.
- **Level accuracy**: of those, the share given the level their true difficulty gives (easy when an average learner's chance σ(−difficulty) is at least 0.7, hard below 0.4).
- **Mean SE** and **95% coverage**: the average standard error, and how often the true difficulty is within 1.96 standard errors of the estimate.

| Learners | First answers per question | Pearson r | Spearman ρ | RMSE | With a level | Level accuracy | Mean SE | 95% coverage |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | 9.0 | 0.702 | 0.690 | 0.786 | 0.0% | — | 0.765 | 94.4% |
| 100 | 30.1 | 0.871 | 0.871 | 0.474 | 99.2% | 71.7% | 0.427 | 92.2% |
| 300 | 90.3 | 0.949 | 0.944 | 0.273 | 100.0% | 83.2% | 0.245 | 91.9% |

- With 30 learners, no question reaches the 20 first answers a level needs, so there is no level accuracy.
- Coverage falls a little short of 95% with 100 and 300 learners: the standard error holds each learner's ability fixed at its estimate, which comes from only 65 answers, so it leaves out that uncertainty and the intervals are slightly too narrow.
- Set levels and true difficulty overlap by design (sd 0.5 around each level), so even the exact difficulties give 70.4% of questions their set level. A mismatch in the admin panel is a reason to look at the question, not proof that its level is wrong.
