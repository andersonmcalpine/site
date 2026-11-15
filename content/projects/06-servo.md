---
kind: Electronics
context: MSE 2201 course project
year: 2025
shape: servo
color: mauve
summary: A stand-alone servo driver built from an LM317 regulator and a 555 timer, run from a 9 V supply with no microcontroller or function generator.
lede: A hobby servo driven from a 9 V supply alone. An LM317 regulator sets a safe supply voltage, and a 555 timer turns a potentiometer into a variable-width control pulse.
details:
- Supply: 9 V in, 5.526 ± 0.002 V regulated (measured)
- Parts: LM317T, NE555, 1N4148 diode, 10 kΩ potentiometer, SG90 servo
- Instruments: Rigol DM3058 multimeter, Rigol DS1102Z-E oscilloscope
- Format: Solo, December 2025
---

# Servo Driver

## Problem

A hobby servo sets its angle from the width of a repeating control pulse. The task was to drive one from a single 9 V supply, with no microcontroller and no function generator. The circuit had to make its own safe supply voltage and its own adjustable pulse.

## Circuit

The driver has three stages: a regulator, a pulse generator and the servo connection.

An LM317T adjustable regulator brings the 9 V input down for the timer and the servo. Two resistors, 1 kΩ and 3.3 kΩ, set its output to 1.25 × (1 + 3.3 / 1.0) = 5.38 V.

An NE555 timer runs as an astable oscillator from that supply. A 10 kΩ potentiometer sits between a 2.2 kΩ and a 100 kΩ resistor, with its wiper on the discharge pin. A 1N4148 diode separates the timing capacitor's charge and discharge paths: the 220 nF capacitor charges through the 2.2 kΩ resistor and one side of the potentiometer, and discharges through the other side and the 100 kΩ resistor. Turning the potentiometer moves resistance from one path to the other, so the pulse width changes while the frequency stays nearly constant.

The regulated supply powers the servo, and the 555 output drives its control input.

![Schematic of the driver: a 9 V input into an LM317T regulator set by 1 kΩ and 3.3 kΩ resistors with 100 nF capacitors, feeding an NE555 astable with a 2.2 kΩ resistor, a 10 kΩ potentiometer, a 100 kΩ resistor, a 1N4148 diode and 220 nF and 22 nF capacitors, whose output drives the servo](figures/servo-circuit.svg "The driver, redrawn from the report's schematics: the LM317T regulator on the left, the NE555 pulse generator in the middle and the servo on the regulated rail.")

[[demo pwm "Turn the potentiometer to change the pulse width and watch the horn follow. The pulse is computed from the ideal 555 equations with the report's component values; the measured ends are marked."]]

## Measurements

Each stage was built and tested on its own before the three were joined. A bench supply powered the 555 stage for its first test, to keep regulator problems out of it, and the servo was checked with a function generator before it was connected to the circuit.

The regulator measured 5.526 ± 0.002 V on a Rigol DM3058 multimeter, against 5.38 V designed. With 5% resistors, root-sum-square propagation of the two tolerances gives 5.38 ± 0.29 V, a range that contains the measured value.

On the oscilloscope, the pulse ran from 0.40 ms at 56.6 Hz to 2.50 ms at 55.7 Hz: duty cycles of 2.3 ± 0.32% and 13.9 ± 0.31%. The duty-cycle uncertainty comes from the scope's 0.05 ms time resolution, propagated through the duty cycle, high time over period.

![Two stacked plots of the output level against time over 40 ms: at minimum duty, 0.40 ms pulses at 56.6 Hz; at maximum duty, 2.50 ms pulses at 55.7 Hz](figures/servo-pwm.svg "The output at both ends of the potentiometer, drawn from the measured frequency and pulse width rather than captured.")

![Rigol oscilloscope screen showing short, widely spaced pulses at the minimum duty cycle](images/servo-scope-min.jpg "Oscilloscope at minimum duty: 0.40 ms pulses at 56.6 Hz.")
![Rigol oscilloscope screen showing wider pulses at the maximum duty cycle](images/servo-scope-max.jpg "Oscilloscope at maximum duty: 2.50 ms pulses at 55.7 Hz.")

Under potentiometer control the servo swept from about 30° to about 150°, smooth and stable through the middle of its travel, with mild jitter near the upper end stop.

## Limits and Next Steps

The jitter near the upper end stop was the one issue recorded, consistent with the servo reaching its mechanical limit. The regulator output sits above 5.0 V, and the pulse repeats at 55.7 to 56.6 Hz rather than 50 Hz.

The next steps are resistor values that bring the regulator closer to 5.0 V, a narrower potentiometer range so the servo is not driven past its stops, and RC values that give exactly 50 Hz.
