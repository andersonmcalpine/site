---
kind: Robotics
context: MSE 2202 team project
year: 2026
shape: sorter
color: rose
summary: A fully autonomous robot that sweeps erasers off the floor, sorts them by colour on a printed conveyor and carries the target colour back to a base station, built by a team of four for $48.77.
lede: A self-powered robot built by a team of four for MSE 2202B, Introduction to Mechatronic Design. A brush and scrapers feed erasers onto a conveyor, a colour sensor picks out the target colour, and an infrared beacon guides the robot back to its base to unload.
details:
- Team: Four students, Winter 2026
- Role: Colour sorting, navigation and much of the wiring
- Controllers: Two ESP32 MSEduino boards; ESP32-C3 base station
- Sensors: TCS34725 colour sensor, IR receiver, wheel encoders
- Tools: SolidWorks, Arduino C++, 3D printing in PLA and TPU
- Cost: $48.77 of a $70 budget
---

# Autonomous Sorting Robot

## Task

The brief was a fully autonomous, self-powered robot that works inside a 15 m² area of unknown terrain. It had to collect erasers off the floor, keep the ones of a target colour and bring them back to a base station, all within 120 seconds on battery power. It also had to pass over floor bumps such as outlets, cost no more than $70 and fit in an MSE 2202 locker without being taken apart.

## Design

Two curved scrapers sweep erasers toward the middle of the robot. There a rotating bristle brush pushes them up a 3D-printed ramp onto a ribbed TPU conveyor belt. A cover over the belt narrows to one eraser length at the colour sensor, so erasers reach it one at a time. At the top of the belt, a stepper-driven flipper guides target erasers into a bucket at the rear.

The robot drives on two wheels with a caster, a choice made over four-wheel and omnidirectional drives for cost, power draw and simplicity. Support pegs at the front and back touch the floor only if the robot tips. At the base, magnets on the bucket arms lock the robot against a printed stand that holds the IR beacon, and a limit switch on the arm starts the dump. Every printed part is PLA except the belt.

![SolidWorks render of the robot: curved scrapers and a bristle brush at the front, a covered conveyor rising toward the rear, a drive wheel and battery on a flat chassis, and two bucket arms at the back](images/sorter-cad.jpg "The final SolidWorks model, with the scrapers and brush at front right and the bucket arms at rear left.")
![Top view of the finished robot on a chair: blue printed scrapers at the top, two circuit boards and many wires on the conveyor cover, a blue bucket at the bottom, and white tape around the edge of the chassis](images/sorter-robot.jpg "The finished robot on showcase day, front at the top. The white tape skirt around the chassis keeps erasers from wedging underneath.")

Two ESP32 MSEduino boards share the work. The first runs the drive motors, the IR receiver and the limit switch, and signals the second when the switch closes. The second runs the conveyor, brush, colour sensor, flipper and bucket motor. Splitting the boards removed timing conflicts and spread the current over separate battery circuits. The base station is an IR LED with a 200 Ω resistor, driven by an ESP32-C3.

## Colour Sorting

The TCS34725 sensor looks straight down at the belt, set to a 50 ms integration time and 4x gain. Each reading's red, green and blue values are divided by its clear channel, so changes in room lighting cancel out. The firmware then measures the Euclidean distance from the normalised reading to two profiles calibrated on the robot: the bare belt and the target eraser.

A reading more than 0.07 from the belt profile means an eraser is present. A reading within 0.07 of the target profile is a match, and the flipper turns to send that eraser to the bucket. The two profiles are 0.148 apart, more than the two thresholds combined, so the bare belt can never count as a match. After each match, an 800 ms lockout stops the flipper chattering while one eraser passes.

![Two panels. Top: normalised red, green and blue for the belt profile (0.277, 0.340, 0.340) and the target profile (0.224, 0.457, 0.267). Bottom: on the line between the two profiles, the belt region reaches 0.07 and the target region spans 0.078 to 0.218 around the target at 0.148, so the two do not overlap](figures/sorter-colour.svg "The two calibrated profiles from the firmware. Top: each channel divided by the clear channel. Bottom: the same profiles on the line between them; the belt and target thresholds leave a gap, so no reading falls in both.")

[[demo sort "Choose what comes down the belt and drag the slider to move it under the colour sensor. The firmware's distance checks decide whether anything is there and whether it is the target, and the flipper drops only for a target."]]

## Navigation

Each leg of the path is driven by encoder count. The firmware converts a distance to encoder pulses using the wheel diameter, and the robot drives until it has counted them. For the first minute it follows a fixed collection path. It then turns for home: while the IR receiver sees the beacon the robot backs toward it, and if the signal is lost for more than 500 ms it turns in place to sweep for it again.

Camera-based targeting was planned, and the scrapers carry a camera mount, but it was dropped for lack of time. The fixed path kept the program simple and kept the robot from getting stuck. The cost is coverage: the robot only collects along a narrow corridor of the area.

## Results

Each test was judged against a pass criterion set from the original requirements. In three sorting trials of ten erasers in random colours and positions, the flipper routed 9 of 10 correctly every time. Collection while driving, with sorting running, succeeded 90% of the time, and the robot crossed floor bumps without trouble.

Return to base, counted as reaching magnet contact with the station within 120 seconds, succeeded in 50% of trials against a 70% target, so it failed. The IR receiver accepts the beacon only over a narrow angle, so a small heading error lost the signal. Low ground clearance was the other cause: erasers bunched near the wheels and wedged under the frame, which the tape skirt reduced but did not stop.

![Bar chart of success rate in percent. Sorting accuracy 90%, pass. Integrated collection 90%, pass. Return to base 50%, fail, with a dashed target line at 70%](figures/sorter-results.svg "Validation results. Solid bars passed; the hollow bar missed its 70% target. Sorting and collection had pass criteria but no numeric target.")

These are small samples. Each sorting and collection result comes from three trials, and the report states that at least ten independent runs per test would be needed to begin estimating a 95% confidence interval. The report treats them as indicative rather than definitive.

## What Changed and Next Steps

The hardest problem was getting erasers from the floor to the sensor reliably. The first belt, made of duct tape, slipped and was replaced with the printed TPU belt. The brush jammed when the robot drove into a pile, so it was moved onto a vertical rail held down by elastic bands: it lifts over a pile, and the bands keep enough pressure on it to pick everything up. The ramp went through several versions until its curve followed the brush radius, slightly offset. A tape skirt and internal barriers keep erasers from wedging under the chassis or falling out.

The report recommends three IR receivers at 0° and ±30°, which it estimates would widen the detection angle from about 15° to 75°, and a higher chassis to clear loose erasers. It also recommends an enclosed bucket inside the frame, a small agitator motor at the conveyor entrance to break up clusters, and a camera for spotting erasers paired with ultrasonic sensors for walls, so the robot can search the whole area rather than one line. Future tests should use a fixed number of runs from random starting points.
