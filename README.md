# Tardy Slip

Play *Surviving High School*, the 2008 Verizon flip-phone edition, in a web browser.
It runs on Windows, macOS, Linux, the Steam Deck, Android and iPhone, with nothing to
install. The football season and its mini-games are drawn pixel for pixel on a 240×320
phone screen, with the phone's D-pad, OK and Back keys underneath.

**No game files are included.** You bring your own copy, and it never leaves your
device.

## Playing

1. Open <https://jtenzer.github.io/Tardy-Slip/> (GitHub Pages serves this repository).
2. Download the game file from the Internet Archive, which keeps a copy of the 2008
   release (version 1.0.5, [item page](https://archive.org/details/qualcomm-brew-games)).
   Either file below works:
   - [`res_xlarge.pud`](https://archive.org/download/brewgames/BREW_by_Straces.zip/BREW_by_Straces%2FBREW%2FAllsiemens%20games%2FSHS%2FSHS%2Fres_xlarge.pud)
     (537 KB): the whole game.
   - [`SHS.rar`](https://archive.org/download/qualcomm-brew-games/Qualcomm%20BREW%20Games.zip/brew2010%2FSHS.rar)
     (612 KB): the same file, as the collector packed it.
   - Optional: [`shs-addons.rar`](https://archive.org/download/qualcomm-brew-games/Qualcomm%20BREW%20Games.zip/brew2010%2Fshs-addons.rar)
     (1.8 MB) adds the 123 episodes the game could download in 2008.
3. Drop the file onto the page, or choose it. The page unpacks it (RAR included),
   checks it and keeps it in your browser's storage. After that the page opens straight
   on the phone, and it works offline.

Controls: the on-screen arrows, OK and Back (Back also pauses), or the keyboard:
arrows, Enter/Space (OK), Backspace/Esc (Back), and `[` `]` (or F1 and F2) for the soft
keys. The game saves itself as you play. Saves stay in that browser on that device.

On a phone, add the page to your home screen. It then opens full screen and the browser
keeps the game files for good.

## What's in this repository

Only the built site: plain HTML, CSS and JavaScript, with no build step and no
server-side code. Any static web host can serve it. Over plain HTTP from another
machine, offline mode and file checks are unavailable (browsers allow them only over
HTTPS or on localhost).

## Credits

- *Surviving High School* was made by Centerscore and published by Vivendi Games
  Mobile, then EA Mobile. This is a fan project to keep an old phone game playable. It
  is not affiliated with or endorsed by Electronic Arts.
- The game files are preserved by the BREW collectors whose archives are on the
  Internet Archive.
- The phone's MIDI music plays through the TimGM6mb General MIDI sound bank by Tim
  Brechbill, under the [GNU GPL version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html),
  unmodified from Debian's [`timgm6mb-soundfont`](https://packages.debian.org/sid/timgm6mb-soundfont)
  package. See `soundbank/TimGM6mb.copyright`; the license text is
  `soundbank/GPL-2.txt`.
