# Naranko Clock

A deliberately plain watch face for Bangle.js 2: the time, large and centred,
with the date underneath. No sensors, no settings, no configuration.

## Usage

Install it and set it as your clock. There is nothing to configure.

## Features

* Large centred time, drawn with the built-in `Vector` font
* Date below it, formatted by the `locale` app so it follows your language
  settings (the weekday is dropped automatically if the line would not fit)
* Redraws once a minute, on the minute, and only inside `Bangle.appRect`, so
  widgets are never overwritten
* Releases its timer on unload, so fast loading between clocks works

## Controls

None. The middle button opens the launcher, as with any clock.

## Requests

Open an issue on the fork.

## Creator

narancu
