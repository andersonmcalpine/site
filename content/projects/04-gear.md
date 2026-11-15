---
kind: Machine learning
context: DS 3000 course project
year: 2025
shape: gear
color: ochre
summary: Six gear conditions, from healthy to a chipped tooth, classified from two-axis vibration data with five model families.
lede: Telling a healthy gear from five kinds of damage using vibration alone, the check predictive maintenance relies on before a gearbox fails.
details:
- Dataset: Mechanical Gear Vibration Dataset, Kaggle, two displacement sensors at 5 kHz
- Data: 876 windows of 1024 samples, 146 per condition
- Models: KNN, SVM, random forest, gradient boosting, 1D CNN
- Tools: Python, scikit-learn, TensorFlow
- Format: Team of four, December 2025
---

# Gear Fault Classification

## Six Conditions

The dataset records a gear test rig in six conditions, each at three speed settings and two loads, with two displacement sensors sampled at 5 kHz. The model has to tell all six apart:

- No fault: A healthy gear, the baseline the other five are compared against.
- Eccentricity: The gear turns off its true centre, so the mesh tightens and loosens once per revolution.
- Missing tooth: One tooth is gone, leaving a gap in the mesh once per revolution.
- Root crack: A crack at the base of a tooth, which weakens it before anything breaks off.
- Surface defect: Damage to the tooth faces where they roll and slide against each other.
- Chipped tooth: Part of a tooth has broken away, so it carries load over a shorter face.

Each recording is cut into windows of 1024 samples (205 ms) with no overlap, 146 per condition and 876 in all. A stratified split puts 613 windows in training, 131 in validation and 132 in the test set.

![Six small line charts, one per condition, each showing 205 ms of sensor 1 displacement about its mean on its own scale](figures/gear-conditions.svg "One test window of each condition, all at the same speed setting and load, drawn from the dataset itself. Each panel has its own scale: this surface-defect window reaches 181 µm from its mean, against 38 to 116 µm for the others.")

[[demo vibration "Choose a condition and step through its 22 test windows with the arrow keys, or click a cell. Hollow cells are the windows the model got wrong." src=assets/data/gear-test.json]]

## Approach

Four classical models, k-nearest neighbours (KNN), a support vector machine (SVM), a random forest and gradient boosting, work from 14 features per window: the mean, spread, minimum, maximum and RMS of each sensor, and the largest peak of each sensor's FFT with its position. The fifth, a 1D convolutional network, reads the raw windows directly through three convolution layers. Every model uses the same split and seed.

## Results

KNN and the SVM each classified 129 of the 132 test windows correctly, 97.7%, and the random forest and gradient boosting reached 96.2%. No damaged gear was mistaken for a healthy one: the three errors were two healthy windows flagged as root crack and chipped tooth, and one surface defect named as a missing tooth.

The 1D CNN scored 0.97 in the submitted run and 0.92 in the saved notebook, so its result varied between training runs. The team still recommended it for deployment because it learns its own features from the raw signal.

![Six by six grid of test-set counts, true condition by row and predicted condition by column: 20 to 22 on the diagonal, with one healthy window predicted as root crack, one as chipped tooth, and one surface defect predicted as missing tooth](figures/gear-confusion.svg "KNN confusion matrix on the 132 test windows, from a rerun of the course notebook that reproduces its results exactly.")

## What the Features Measure

Rerunning the notebook from the raw data reproduces these results exactly, and shows what drives them. The FFT was taken without removing each window's mean, so its largest peak is always the 0 Hz term: those features measure the signal's average level, not its vibration. That level differs between conditions by up to 3 µm, and on its own it classifies 88.6% of the test windows. Features that ignore it, the spread, peak to peak, kurtosis and true dominant frequency of each sensor, reach 76.5% with the same model.

Each condition was recorded separately, so part of that level difference may come from the setup rather than the fault. The next version would remove the mean before computing any feature and split the data by recording session rather than by window, so the test score measures the gear and not the recording.
