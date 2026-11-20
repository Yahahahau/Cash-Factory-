# Stage presentation and animation system

## Architecture
| Module | Role |
|---|---|
| `src/scene/themes.js` | **Data.** One theme per palette slot (stage `n` uses `THEMES[(n - 1) % 6]`): surfaces, colours, lighting, back wall mode, ambient effect, and the names of the animations it uses |
| `src/scene/stage-anim.js` | **Animation definitions:** easing library, a dt-driven `Timeline`, reusable animation definitions and the transition schedule |
| `src/world.js` | `setStage(def, animate)` builds the stage (`_build`) and either swaps instantly or runs `_transition` |

Gameplay never reads any of these files. Physics colliders are rebuilt immediately by `physics.js` and
`machines.js`, exactly as before. Only visuals move. During the transition no coins are on the board:
the game banks leftover coins, and `stageBusy` (2.4 s) blocks spawning, so the visuals can never disagree
with a coin.

## Themes
| Stage | Theme | Wall surface | Enter | Exit | Idle | Celebration |
|---|---|---|---|---|---|---|
| 1, 7, ... | Steel Works | Brushed steel panels | `extrude` | `retract` | `machineHum` | `sparkBurst` |
| 2, 8, ... | Tide Pool | Glazed tiles | `rise` | `sink` | `gentleSway` | `bubbleBurst` |
| 3, 9, ... | Neon Arcade | Hex panelling + glowing trim | `zip` | `retract` | `neonPulse` | `sparkBurst` |
| 4, 10, ... | Candy Works | Quilted candy plastic | `pop` | `squash` | `gentleSway` | `confetti` |
| 5, 11, ... | Bio Lab | Painted plaster cladding | `rise` | `sink` | `machineHum` | `bubbleBurst` |
| 6, 12, ... | Sun Workshop | Wooden planks | `slam` | `retract` | `gentleSway` | `sparkBurst` |

To add a theme, add an entry to `THEMES` (and a back wall `mode` branch in `backdrop.js` for a new ambient
effect). To add an animation, add a definition to `stage-anim.js` and name it in a theme.

## Animation types (reusable definitions)
Each definition is plain data: `{ dur, stagger, run(target, k) }` with raw progress `k` in 0..1. Easing is
applied inside `run`.

| Type | Definitions | Target |
|---|---|---|
| **Entrance** (`PART_ENTER`) | `extrude` (out of the wall, slight overshoot), `rise` (unfolds vertically and lifts into place), `zip` (springy, elastic), `pop` (scale with strong overshoot), `slam` (fast push out, then a squash settle), `grow` (base piece rising from the floor) | A house part (scale and offset vector) |
| **Exit / stage completion** (`PART_EXIT`) | `retract` (back into the wall, anticipates with a small pull), `sink`, `squash`, `lower` | A house part |
| **Reveal** (`OBJ`) | `popIn`, `growUp` (gate field), `shrinkOut`, `sinkDown` | Props: pistons, belts, fans, magnets, launch pads, gates |
| **Transition** | Back wall wipe (`Backdrop.beginBlend` / `setMix` / `finish`), light blend (`_lerpLight`), wall colour blend | Whole scene |
| **Celebration** (`CELEBRATE`) | Themed particle recipes, plus a back wall flash and a key light pulse | Whole scene |
| **Idle and ambient** | `machineHum` (warning lamps blink), `neonPulse` (trim glow breathes), `gentleSway` (soft lamp glow); ambient motion lives in the back wall shader (caustics, bubbles, stars, bokeh, rays, dust) and the Steel Works gears | Lights and emissive materials only: structures stay still |
| **Special events** (unchanged triggers from `machines.js`) | Gate field flash, launch pad spring and glow, magnet pulse ring, belt tread and hub scroll, fan spin and wind streaks, grinder speed-up on collection, pipe squash when a coin drops | Props |

## Stage transition timeline (`TRANSITION` in `stage-anim.js`)
| Time (s) | What happens |
|---|---|
| 0.00 | **Celebration:** the old theme's particle recipe, a back wall flash in a softened accent colour, and a key light pulse. The price labels fade out (`world.onTransition(true)`) |
| 0.05 to 0.6 | **Exit**, bottom to top with a stagger: props shrink first, then each platform runs the old theme's exit |
| 0.45 to 1.45 | **Lights** blend to the new theme |
| 0.55 to 1.5 | **Back wall** wipes upward from the old theme to the new one, with a glowing edge |
| 0.62 | **Swap.** The old stage's geometry and textures are disposed and the new stage is built with every part at its start pose. The new wall colours start from the old theme's colours and blend over 0.8 s, so the re-skin is not a hard cut |
| 0.72 and later | **Entrance**, top to bottom with the theme's stagger. Each platform's props reveal when the platform is about 55% out. Late props (the magnet and the gate) reveal last |
| End + 0.5 | Every part is reset to exactly identity and the labels fade back in |

All the stagger gives a cascade, so not every object moves at once. Everything is driven by the frame `dt`
(`Timeline.update(dt)`), so timing is frame-rate independent. If `setStage` is called again during a
transition (a new run or a cloud save load), `Timeline.finish()` jumps every item to its end state and the
new stage is built instantly.

The grinder and the dispenser pipe are identical on every stage, so they never animate: the swap is
invisible there.
