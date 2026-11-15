---
kind: Sports analytics
context: independent project
year: Ongoing
shape: dashboard
color: clay
summary: Live win-probability models trained on NBA play-by-play data, with a real-time poller and a SwiftUI dashboard for macOS.
lede: Live win-probability models trained on NBA play-by-play data, with a poller that tracks games in real time and a SwiftUI dashboard for macOS.
details:
- Status: Ongoing
- Tools: Python, pandas, PyTorch, SwiftUI
- Testing: CI with ruff and pytest on Python 3.11 to 3.13
---

# NBA Live Win Probability

## System Overview

Play-by-play is turned into possessions and game-state features. The live model, WinModel, gives each team's chance of winning after every play. A poller follows games as they happen, and a scorecard checks every prediction against the final result.

![Momentum panel of the dashboard: bars of points ahead over the last three minutes across four quarters, with three marked swings](images/nba-momentum.jpg "The SwiftUI dashboard's momentum panel: points ahead over the last three minutes, with the biggest swings marked.")
![Win-probability curve for Memphis across the game, ending near zero](images/nba-curve.jpg "Win probability through the finished game, Thunder 114, Grizzlies 108.")
![Play-by-play list of the final plays, with the score and win probability after each](images/nba-plays.jpg "Play by play, with the win probability after each play.")

## Results

Over 45 preseason games in October 2026, WinModel's live Brier score was 0.175 against ESPN's 0.173. Lower is better, placing it within 0.002 of ESPN.

[[demo winprob "WinModel's live win probability through the 29-point playoff comeback, play by play." src=assets/data/winprob-0042400143.json]]

## Next Steps

The 2026–27 regular season will provide the main evaluation. About 500 games are needed to tell a 0.01 difference in Brier score apart.
