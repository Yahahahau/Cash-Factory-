# Environment design

## The "house": one seamless structure

The side walls, the floor, every wall platform, the funnel plate and the support column under the lowest
platform are **one mesh**, built in `src/scene/geometry.js` (`buildHouse`).

1. **One outline.** The code walks one closed 2D outline: down the left wall's inner face, out and around
   every left platform and the tilted funnel plate, across the floor, around the lowest right platform and
   its support column, and up the right wall around every right platform. The room under the base
   platform is a hole in the same outline.
2. **Every corner rounded with the same rule.** `roundOutline` replaces every corner with an arc tangent to
   both edges, and handles outside corners and inside corners the same way:

   | Corner | Radius |
   |---|---|
   | Outside corner of a platform or plate (free end) | `HOUSE.convex` = 0.12 |
   | Fillet where a platform leaves a wall | `HOUSE.concave` = 0.22 |
   | Wall meets floor | `HOUSE.floorFillet` = 0.32 |
   | Floor corners of the room under the base | 0.26 |

   Radii are clamped when two corners are close, for example where the funnel plate meets the platform
   above it, so arcs never overlap.
3. **Extruded once with a bevel.** The outline is extruded to the platforms' collider depth
   (`SLAB_Z * 2`) with a 0.055 front and back bevel. `bevelOffset = -bevel` keeps the side faces exactly
   on the outline, so the visual top of every platform matches its collider top. The bevels are therefore
   the same width everywhere.

Because walls and platforms are one surface, there are:
- no boxes pushed into each other,
- no coplanar faces (no z-fighting),
- no gap or seam at a join, and
- no doubled bevel at a corner.

A join is a single fillet that the lighting draws as one continuous curve.

### Parts (used by the stage animations)
Each platform, the plate and the base piece is a **part**. A vertex attribute `aPart = (id, anchorX, anchorY)`
is assigned per vertex: the nearest outline point decides the part. A small vertex-shader hook
(`addPartHook` in `materials.js`) scales and offsets each part about its anchor:
- **Platforms:** the anchor is the wall, so the platform extends from the wall or retracts into it.
- **Base piece:** the anchor is the floor, so it grows up from the floor.

The same hook runs on the shadow depth material, so shadows follow the animation. Normals are corrected
for the non-uniform scale. When the animation ends, every part is exactly at scale 1, offset 0.

## Surfaces (`src/scene/textures.js`)
Each theme has one procedural surface recipe, a height field that produces a colour map and a normal map
(a roughness map is generated too, for later use). Because all three come from one field, the relief and
the colour detail always line up.

| Recipe | Look | Tile |
|---|---|---|
| `steel` | Large brushed panels, fine seams, corner rivets | 2 units |
| `tile` | Glazed ceramic tiles of 0.5 units, grout, per-tile shade variation | 2 units |
| `hex` | Soft hexagon relief (arcade panelling) | 2 units |
| `quilt` | Glossy candy plastic with a quilted diamond pattern | 2 units |
| `plaster` | Painted plaster with horizontal cladding lines | 2 units |
| `wood` | Vertical planks with grain, knots and gaps | 2 units |
| `paint` | Fine orange-peel paint (tops and bevels) | 1 unit |
| `tread` | Rubber belt ridges | 0.9 units |

The textures tile seamlessly: the noise wraps at the tile size. UVs are in world units (the extrusion uses
world UVs), so the pattern has the same scale on walls and platforms. Each texture is generated once per
session and shared (256 × 256, about 10 to 40 ms the first time a theme is shown).

### Materials
- **Wall faces (front caps):** theme colour, colour map and normal map. No roughness map and no
  reflections, because this is the largest surface on screen and per-pixel cost matters on phones.
- **Tops and bevels (extrusion sides):** a separate trim material, a lighter painted finish. The edges
  therefore read clearly against the faces.
- **Props:** a shared library (`MaterialLibrary`) with:
  - chrome, steel, dark steel and brass (metallic, with reflections),
  - painted housing,
  - rubber (matte),
  - glossy plastics with clear coat: the pipe green, the red and the grinder green,
  - a hazard decal and emissive lamps and emitters.

  Every prop that is made of the same thing uses the same material instance.

## Lighting
Lighting uses three lights; the colours and intensities of each come from the theme and blend during a
transition:

| Light | Role |
|---|---|
| Hemisphere (sky / ground) | Base fill |
| Key directional, upper left | Casts the shadows: PCF soft, 1024 map on high, 512 on medium, off on low |
| Fill or rim directional, upper right | Lifts the shadowed sides and draws the bevels and fillets |

Image-based reflections (the room environment) are applied only to metals, glossy plastics and coins.

Grounding: platforms, props and coins cast soft shadows onto a transparent shadow catcher in front of the
back wall. The fillets and bevels give contact shading where structures meet. There is no screen-space
ambient occlusion: it would cost too much on phones.

## Back wall (`src/scene/backdrop.js`)
The back wall is one full-screen shader plane. It draws a theme's gradient ("cylinder" shading towards the
walls) plus that theme's ambient effect:

| Theme | Ambient effect |
|---|---|
| Steel Works | Faint wall panels, slow light beam, and four slow gears that mesh behind the machine (unlit, so they read as part of the wall) |
| Tide Pool | Animated caustics, brighter towards the top, and drifting bubbles |
| Neon Arcade | Glowing floor grid fading upwards, and twinkling stars |
| Candy Works | Soft drifting bokeh and faint candy stripes |
| Bio Lab | Vertical light bands with bubbles rising in them |
| Sun Workshop | Slow sun rays from the upper left and floating dust |

All the effects except the gears cost one draw call. During a stage transition, two themes are blended
with an upward diagonal wipe that has a glowing edge.
