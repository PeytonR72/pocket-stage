# Asset provenance

## Backstep showcase

The assets in `public/demo/` were prepared for Pocket Stage on 2026-11-12 from Peyton's [Backstep repository](https://github.com/PeytonR72/backstep-ai), inspected at commit [`93dc7916001bdb1c15f74f7fdfd261485279532b`](https://github.com/PeytonR72/backstep-ai/commit/93dc7916001bdb1c15f74f7fdfd261485279532b).

- `backstep.pocket-stage.json` embeds three normalized screenshots: the product website hero (Main), a reformatted excerpt of actual recorded CLI output (Detail), and the website's workflow section (Extra). The website screenshots came from the unmodified repository landing page served locally.
- The Detail screenshot is labeled as an excerpt of recorded stdout and selected journal columns, not a native Backstep GUI. It retains the real `delete_project` refusal and journal values `R4` / `unrevertable`. It is a presentation of the recorded experiment, not a new tool call.
- The local experiment ran the real Backstep stdio proxy against a harmless local MCP fixture. The irreversible call was refused, the fixture was not invoked, and the journal recorded the refusal. It did not run a PostgreSQL rollback benchmark.
- The website's account/recovery animation is the author's scripted illustration. It does not prove that a live database restore occurred during asset capture.
- `backstep-showcase.mp4` is a real Pocket Stage browser export of that project: H.264, 1920 × 1080, 30 fps, 360 frames, twelve seconds, and no audio. `backstep-poster.jpg` is a still from the film.

The original CLI excerpt's source transcript was fingerprinted as SHA-256 `b735378ea949c20344ccc326251c122694c21c93066c07a6600169774e729e3e`. Internal journals and capture logs are not part of this public source distribution. No blanket license for the Backstep screenshots, branding, or derived demo assets is asserted here; refer to the upstream owner for reuse permissions.

## Font

`public/fonts/Manrope.ttf` is Manrope, copyright 2018 The Manrope Project Authors. Its SIL Open Font License 1.1 and attribution are preserved in [`public/fonts/OFL-Manrope.txt`](public/fonts/OFL-Manrope.txt). Font source: [googlefonts/manrope](https://github.com/googlefonts/manrope).

## Default project image

`public/fixtures/fieldwork.png` is an authored, fictional interface fixture used for the default Fieldwork project. Its HTML source is included as `public/fixtures/fixture.html`. It is sample interface content, not a screenshot of an independently verified product or customer account.

## Software dependencies

Installed dependencies have their own package licenses and terms. Remotion has separate [licensing terms](https://www.remotion.dev/docs/license) and [telemetry behavior](https://www.remotion.dev/docs/telemetry); bundling Pocket Stage source does not grant a Remotion commercial license. This file records provenance and attribution, and does not grant broader rights to any third-party material.
