# Transcription cost — measurement of 2026-11-14

What it would cost to turn call recordings into text: on the site's own CPU with an open-source
engine, or with a paid service. A report only, with no product recommendation. Measured in the
night of 2026-11-14 to 2026-11-15 on the development PC.

**These numbers are an estimate.** They come from one laptop CPU that was busy with other work
the whole time (see "Background load"), from one 45-minute English audiobook chapter and one
15-second test recording. A server CPU, other voices, several speakers talking over each other
or other languages will give other numbers.

## The machine

- CPU: Intel Core Ultra 7 165U, 12 cores / 14 threads, a hybrid laptop chip (performance,
  efficient and low-power efficient cores). The engine reports AVX2, AVX-VNNI, FMA and F16C.
- Windows 11 Pro, the engine's own x64 build (no GPU, no OpenVINO, no Core ML).
- "1, 2 and 4 cores" means the engine's thread count (`-t 1`, `-t 2`, `-t 4`). Windows picked
  the cores; they were not pinned, because on this hybrid chip it is not known from the outside
  which core numbers are fast ones. The engine's own CPU use confirms the count: about 7 %,
  14 % and 27.5 % of the 14 threads, which is 1, 2 and 3.9 of them.

## Engine, models, audio

| What               | Which                                                                                                                                                                    | Licence                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Engine             | whisper.cpp, Windows x64 release build b5454 (2026-10-06), `whisper-cli`                                                                                                 | MIT                          |
| Model `base.en`    | `ggml-base.en.bin`, 148 MB, English only (from huggingface.co/ggerganov/whisper.cpp)                                                                                     | MIT (OpenAI Whisper weights) |
| Model `small.en`   | `ggml-small.en.bin`, 488 MB, English only (same source)                                                                                                                  | MIT (OpenAI Whisper weights) |
| Public sample      | LibriVox, "The Adventures of Sherlock Holmes", chapter 3 "A Case of Identity", read in English, 45 min 18 s. archive.org/details/adventures_sherlockholmes_1007_librivox | Public domain (LibriVox)     |
| Reference text     | Project Gutenberg eBook #1661, the same story                                                                                                                            | Public domain in the USA     |
| Owner's test audio | The sound of the test recording from the backup, 15.5 s, decrypted only into a throwaway folder and deleted after the runs; nothing uploaded, nothing quoted here        | —                            |

Both audio files were converted to 16 kHz mono WAV first (whisper.cpp's input); that step is
not in the times. The larger models (`medium`, `large`) were not measured: `small.en` on one
thread already takes about as long as the audio itself.

## Background load

Other work ran on the PC the whole night and was left alone (nothing was stopped or slowed).
Before every run a 30-second idle baseline was taken; during every run the overall CPU % and the
engine's own CPU % were sampled every 3 seconds. Background = overall minus the engine's share.

- Idle baseline before the runs: 21–35 % overall (average per baseline), peaks up to 47 %.
- Busiest other processes in the baselines (names only): Code.exe (8–13 %), vmmemWSL (2–3 %),
  MsMpEng.exe (1.5–2 %, once 9.6 %), at times Creative Cloud.exe (7–9 %) and svchost.exe.
- The rule was: discard a run whose background averaged over 15 %, repeat it later, at most
  twice. **The machine never got below 15 %**: every run was discarded and repeated twice, and
  each number below is the run with the lowest background of its three, marked "busy". So every
  run in this report counts 2 discarded runs.
- The three tries of each run agreed within 5 % on the long sample, so the load slowed every try
  about equally; on a quiet machine the times are likely somewhat shorter.

## Results — the 45-minute public sample

Time per hour of audio = the run's wall time scaled to 60 minutes of audio. Peak memory is the
engine's peak working set. "Background" is the background CPU % during that run (average /
peak), "discarded" the runs thrown away for it.

### 4 cores

| Model    | Wall time (45:18 audio) | Per hour of audio | Speed vs. real time | Peak memory | Background avg / peak | Discarded |
| -------- | ----------------------- | ----------------- | ------------------- | ----------- | --------------------- | --------- |
| base.en  | 13 min 0 s              | 17.2 min          | 3.5 ×               | 659 MB      | 32.9 % / 51.6 % busy  | 2         |
| small.en | 37 min 5 s              | 49.1 min          | 1.2 ×               | 1,127 MB    | 28.8 % / 51.5 % busy  | 2         |

### 2 cores

| Model    | Wall time (45:18 audio) | Per hour of audio | Speed vs. real time | Peak memory | Background avg / peak | Discarded |
| -------- | ----------------------- | ----------------- | ------------------- | ----------- | --------------------- | --------- |
| base.en  | 15 min 39 s             | 20.7 min          | 2.9 ×               | 656 MB      | 30.1 % / 47.2 % busy  | 2         |
| small.en | 45 min 52 s             | 60.8 min          | 1.0 ×               | 1,124 MB    | 28.4 % / 48.8 % busy  | 2         |

### 1 core

| Model    | Wall time (45:18 audio) | Per hour of audio | Speed vs. real time | Peak memory | Background avg / peak | Discarded |
| -------- | ----------------------- | ----------------- | ------------------- | ----------- | --------------------- | --------- |
| base.en  | 34 min 43 s             | 46.0 min          | 1.3 ×               | 641 MB      | 27.3 % / 55.7 % busy  | 2         |
| small.en | not measured            | —                 | —                   | —           | —                     | —         |

`small.en` on one core was stopped before it finished: with the two repeats it would have run
about four and a half hours into the morning, and the plan was to drop the long sample first
when time ran short. From the other rows it would take roughly twice the 2-core time, around two
hours per hour of audio; that figure is a guess, not a measurement.

## Results — the 15-second test recording

| Model    | Cores | Wall time (15.5 s audio) | Peak memory | Background avg / peak | Discarded |
| -------- | ----- | ------------------------ | ----------- | --------------------- | --------- |
| base.en  | 1     | 15 s                     | 299 MB      | 22.4 % / 25.7 % busy  | 2         |
| base.en  | 2     | 9 s                      | 301 MB      | 26.6 % / 26.9 % busy  | 2         |
| base.en  | 4     | 9 s                      | 303 MB      | 28.7 % / 30.5 % busy  | 2         |
| small.en | 1     | 42 s                     | 766 MB      | 23.9 % / 29.2 % busy  | 2         |
| small.en | 2     | 18 s                     | 767 MB      | 27.5 % / 35.1 % busy  | 2         |
| small.en | 4     | 18 s                     | 770 MB      | 30.1 % / 37.8 % busy  | 2         |

For a clip this short the time is mostly loading the model and the engine's fixed 30-second
window, not the audio; these rows say little about cost per hour. Each run had only 2 to 13 CPU
samples (one every 3 s), so the background figures are rough.

## Quality

- Public sample, word error rate against the Gutenberg text (lowercased, punctuation dropped,
  the spoken LibriVox announcement cut off; 7,028 reference words): **base.en 3.0 %**,
  **small.en 5.1 %**. The larger model did worse here:
  its text has 7,152 words against base.en's 7,038 (no repeated lines; why it adds words was
  not checked). One sample is not enough to rank the two models. The same model gives the same text at any thread count, so this holds
  for every row of its model. Some of the counted errors may be places where the reading and
  the Gutenberg text differ; that was not checked.
- One clear voice reading a book is the easy case. Calls have several people, crosstalk,
  laughter and room sound; expect a clearly higher error rate there.
- Test recording: it holds little or no speech. `base.en` returned only a no-speech marker,
  `small.en` a single word. It gives timings, not a quality figure.

## How much a 6-hour night can transcribe

Six hours of wall time divided by the time per hour of audio, with the background load as above:

| Model    | 1 core       | 2 cores | 4 cores |
| -------- | ------------ | ------- | ------- |
| base.en  | 7.8 h        | 17.4 h  | 21.0 h  |
| small.en | not measured | 5.9 h   | 7.3 h   |

Going from 2 to 4 threads gained little (base.en 17 %, small.en 19 %). Likely reasons, not
checked: Windows put some of the threads on the slower efficient cores, and the busy
background competed for the same cores and memory bandwidth.

## Paid services

Prices as listed on 2026-11-14, in US dollars, for recorded audio (batch, not live):

| Service                                                  | Price per minute | Per hour of audio |
| -------------------------------------------------------- | ---------------- | ----------------- |
| OpenAI `gpt-4o-mini-transcribe`                          | $0.003           | $0.18             |
| OpenAI `gpt-transcribe`                                  | $0.0045          | $0.27             |
| OpenAI `gpt-4o-transcribe` and `whisper-1`               | $0.006           | $0.36             |
| AWS Transcribe, batch, US East (N. Virginia), first tier | $0.006           | $0.36             |

Sources: OpenAI <https://developers.openai.com/api/docs/pricing>, AWS
<https://aws.amazon.com/transcribe/pricing/> (billed per second, no minimum; the page says the
price is tiered by monthly volume but lists only this one). Both were read on 2026-11-14; prices change.

Cost per month for example amounts of recorded audio:

| Hours of audio per month | $0.003 / min | $0.0045 / min | $0.006 / min |
| ------------------------ | ------------ | ------------- | ------------ |
| 10 h                     | $1.80        | $2.70         | $3.60        |
| 50 h                     | $9.00        | $13.50        | $18.00       |
| 200 h                    | $36.00       | $54.00        | $72.00       |

A paid service means the call audio leaves the site's server for the provider; the prices above
are only the bill, not that question.

## How it was measured

A small script (not in the repository) started `whisper-cli -m <model> -f <audio> -t <n> -l en
-otxt`, watched only its own process with Python's `psutil` 7.0.0 and wrote one line per run;
the word error rate is a plain word-level edit distance. The scripts and raw lines stayed in the
night's scratch folder and were not committed.
