# Design

Pixel draft for human review. Static only: no live calls.

- `index.html`: the three screens (Keyhalt, Agent, Timeline) in one file, switched
  by `#agent=` / `#timeline` hashes. All data is captured from `../evidence/`;
  the only script is the block ticker and the copy button.
- `fonts/`: Inter and JetBrains Mono (variable TTF) with OFL 1.1 texts
  (`OFL.txt`, `OFL2.txt`), self-hosted.
- `DEVIATIONS.md`: decisions where the console deliberately does less (D-01:
  actions without keys).
- `REVIEW.md`: the review companion with screenshots.
- `screenshots/`: `keyhalt.png`, `agent.png`, `timeline.png` at 1920×1080.

Serve with any static server, e.g. `python3 -m http.server --directory design`,
then check the screens. The demo format is a split screen with a terminal on
the other half.
