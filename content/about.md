---
lede: Dual-degree student in Mechatronic Systems Engineering and AI Systems Engineering at Western University, with project work in robotics, embedded control, computer vision and machine learning. Seeking robotics and embedded systems internships from May 2027.
photo:
photo_alt:
---

# Mechatronics and AI Engineering

## Areas of Focus

Robotics and embedded control come together in the [6-DOF robotic arm](work/arm.html), a two-person build. My teammate leads the mechanical design, including a 55:1 compound planetary gearbox. I brought up the drive side: six brushless motors, three REV NEO and three NEO 550, flashed, calibrated and tuned on their drives, and run over one CAN bus from an STM32 Nucleo-F446RE.

The [autonomous sorting robot](work/sorter.html), a four-person course project, collects erasers, sorts them by colour with a calibrated sensor on a printed conveyor and returns to its base on an infrared beacon, running on two ESP32 boards. I worked mainly on the colour sorting and navigation, and wired much of the robot.

In computer vision, [fastener recognition](work/fastener.html) outlines screws, bolts and nuts with rotated boxes, so a gripper can be given each part's position and long-axis angle. The model is YOLO11n-OBB, trained on two public datasets, with Raspberry Pi 4 B deployment as the next step.

In analog electronics, a [servo driver](work/servo.html) built from an LM317 regulator and a 555 timer was checked stage by stage against its design with a multimeter, an oscilloscope and uncertainty analysis.

The machine learning projects classify [gear faults](work/gear.html) from vibration data alone and estimate [live NBA win probabilities](work/nba.html) from play-by-play data, with a poller and a SwiftUI dashboard for macOS. At BMO Financial Group I connected an internal AI chatbot to customer-profile systems and built serverless AI batch jobs on AWS Lambda.

## Approach

### Simulation Before Hardware
The arm's Python simulator runs the exact command stream the drives would receive, so every motion can be checked and replayed before it reaches a motor. It models the drives' trajectory planning and is covered by 33 tests.

### Per-Source Evaluation
Fastener detection is scored per source, not only overall. That exposed a gap between separated parts and clustered ones, and tuning on validation data then raised bin-picking precision from 0.81 to 0.90.

### Continuous Testing
GitHub Actions runs ruff and pytest on Python 3.11 to 3.13 for every change to the NBA project. The fastener pipeline's regression tests cover rotated-box geometry and matching, and run locally.

### Evidence-Based Model Selection
For gear faults, five model families were compared on the same vibration windows, from k-nearest neighbours to a 1D convolutional network, before the 1D CNN was chosen. The NBA model is measured against ESPN's: a live Brier score of 0.175 against 0.173 over 45 preseason games.

## Timeline

- Expected Apr 2028 | Western University | Dual degree in Mechatronic Systems Engineering and AI Systems Engineering, London, Ontario
- Ongoing | [6-DOF Robotic Arm](work/arm.html) | Robotics, two-person project
- Ongoing | [NBA Live Win Probability](work/nba.html) | Sports analytics, independent project
- 2026 | [Fastener Recognition](work/fastener.html) | Computer vision, robotic bin picking
- May–Aug 2026 | AI Developer Intern | BMO Financial Group, Toronto
- 2026 | [Autonomous Sorting Robot](work/sorter.html) | Robotics, MSE 2202 team project
- Apr–Aug 2025 | Analyst | Cushman & Wakefield, Toronto
- 2025 | [Gear Fault Classification](work/gear.html) | Machine learning, DS 3000 course project
- 2025 | [Servo Driver](work/servo.html) | Electronics, MSE 2201 course project
