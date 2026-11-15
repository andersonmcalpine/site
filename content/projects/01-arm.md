---
kind: Robotics
context: two-person project
year: Ongoing
shape: arm
color: dusk
summary: A six-axis robotic arm built by a team of two. My teammate designs the mechanics; I brought up the drive system, six brushless motors flashed, calibrated, tuned and commanded over one CAN bus from an STM32.
lede: A six-axis robotic arm built with one teammate. While the mechanical design is finished, I have brought up all six joint drives, from firmware and motor calibration to tuning and a CAN bus run from an STM32, with laptop tools to test every motor.
details:
- Status: All six drives wired and running on CAN; arm in its third design revision
- My part: Drive bring-up, CAN bus, STM32 firmware, test tools, drive simulator
- Motors: Three REV NEO and three NEO 550, with hall sensors
- Hardware: ODESC v4.2 drives, STM32 Nucleo-F446RE, TJA1050 CAN transceiver
- Gearbox: Compound planetary, 55:1, designed by my teammate
- Tools: C, Python, odrivetool
---

# 6-DOF Robotic Arm

## Drive Bring-Up

Each joint is a brushless motor on its own ODESC v4.2 drive, with REV NEO motors on the three large joints and NEO 550s on the wrist. The drives shipped with unreleased factory firmware, so I backed up each board's complete flash before installing the official ODrive 0.5.6 firmware through the STM32's USB bootloader, checking every write byte for byte.

Each motor was then calibrated on its own drive: phase resistance and inductance measured, hall-sensor polarity and offset found, and a current limit set for its type, 50 A for the NEOs and 30 A for the NEO 550s. The measurements agree within each type, 23.3 to 24.0 mΩ per phase for the NEOs and 43.6 to 44.5 mΩ for the NEO 550s.

Every drive runs cascaded position and velocity loops. I tuned the position gain, velocity gain and velocity integrator of each joint in steps, so the six settle on their own values, and every move follows a trapezoidal profile limited to 2 turns/s and 5 turns/s².

![Table of the six drives with node, motor, current limit, measured phase resistance and inductance, and the tuned position, velocity and integrator gains](figures/arm-drives.svg "The six drives as configured, read from their saved backups. Gains are in ODrive units: position (turn/s)/turn, velocity Nm/(turn/s), integrator Nm/turn.")

## CAN Bus

The six drives share one CAN bus at 500 kbit/s as nodes 1 to 6. An STM32 Nucleo-F446RE joins it through a TJA1050 transceiver and turns a simple serial protocol from the laptop into ODrive's CAN messages: a line such as P 3 1.5 sends drive 3 to 1.5 turns, and the board reports every drive's state, errors, position, velocity and current.

Bringing the bus up turned up one fault: every drive's unused second axis also answered as node 1, which broke the first drive's tests. Moving those axes to a spare node cleared it.

Two Python tools run the bus from the laptop. One checks each drive's heartbeat and encoder rates, errors and telemetry, and can nudge each motor and back; the other moves any motor to a typed position. With them, all six motors have been read and driven over CAN.

## Firmware

The bridge firmware is written in C on the STM32 HAL and built with a Makefile. Its newer version runs the serial link at 460,800 baud, reads it without blocking, queues outgoing CAN frames and streams telemetry from all six drives at up to 200 Hz. It is tested against a stand-in for the board and is next to be flashed.

## Simulation

A Python simulator runs the exact command stream the hardware receives and models the drives' own trajectory planner, so every motion can be checked and replayed before it reaches a motor. It takes its drive settings straight from the drive backups and is covered by 33 tests. Its geometry and gear ratios are placeholders until the CAD is final.

## Gearbox

Each joint will drive through a compound planetary gearbox, designed by my teammate in Fusion 360. Five stepped planets run through two layers. In the first, a 30-tooth sun on the motor drives the planets' 25-tooth lower half around an 80-tooth ring that is held still. In the second, the planets' upper half, also 25 teeth, meshes with a 75-tooth ring that carries the output.

The two rings differ by five teeth, so each turn of the planets around the centre moves the output ring back by only a fifteenth of a turn. Together with the first stage, the motor turns 55 times for each turn of the output, in the opposite direction, from a gear stack about 100 mm across and 20 mm tall.

[[demo gearbox "Play, or drag the slider, to turn the motor and watch both layers. The output ring, marked in colour, moves once for every 55 turns of the sun."]]

## Next Steps

Once the arm is printed, I will program the STM32 and a Raspberry Pi to run it, and move the simulator to ROS 2. The Raspberry Pi 4 and its HQ camera are already set up and streaming 1080p video for the vision side.
