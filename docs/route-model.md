# Route model

One set of routing rules for the tools that read a wormhole chain: Tripwire's
Routes, the Trippy Discord bot, Short Circuit and Aperture's route planner.
Each tool keeps its own pathfinder, in its own language. What they share is
this page and `route-vectors.json`: a tool conforms when its router gives the
expected route for every case in that file.

The model is Aperture's (`src/lib/map/routePlanner.ts`), as Trippy
(`src/chain/route.ts`) already follows it, with Trippy's avoid list and
Zarzakh rule written down.

## The graph

- **Systems** are EVE solar system ids (30000000 and up). Anything else, such
  as a mapper's placeholder for "some class 3" or an unknown far side, is not
  a system and is never passed through.
- **Gates** are stargate links, both ways. A gate that is closed (a faction
  warfare gate, say) is simply not in the graph.
- **Holes** are the chain's wormholes, both ways.
- **EVE-Scout holes** are the public Thera and Turnur connections, both ways.
  They are used only when the preferences ask for them.

Each system has a **band**: `high` (true security 0.45 and up), `low` (above
0, below 0.45) or `null` (everything else: null-sec, Pochven, J-space, and
any system whose security is not known).

## Preferences

| Name | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `shortest`, `safer`, `less_safe` | `shortest` | How a jump is weighed (below) |
| `minShip` | `s`, `m`, `l`, `xl`, none | none | The smallest hole the ship fits through |
| `skipEol` | yes/no | no | Leave out holes at end of life |
| `skipCrit` | yes/no | no | Leave out holes at critical mass |
| `skipReduced` | yes/no | no | Leave out holes at reduced or critical mass |
| `skipNoSig` | yes/no | no | Leave out holes with no signature recorded |
| `avoid` | system ids | none | Systems never passed through |
| `scout` | yes/no | no | Use EVE-Scout's holes |

## Cost

Every jump costs **1, plus a penalty for the system entered**:

| Mode | `high` | `low` | `null` |
|---|---|---|---|
| `shortest` | 0 | 0 | 0 |
| `safer` | 0 | 50 | 100 |
| `less_safe` | 50 | 0 | 0 |

The route is the one with the lowest total. Penalties are finite on purpose: a
destination that can be reached is never reported as unreachable, it just
costs more. The number of **jumps** reported is always the true count of hops,
whatever the penalties were.

## Which holes are left out

A chain hole has a **life** (`stable`, `eol`, `last_hour`), a **mass**
(`stable`, `reduced`, `critical`) and, when its type is known, a **size**. It
has **no signature** (`noSig`) when neither side has a signature id recorded:
typically a connection a mapper drew from a pilot's jump. The hole may well
have been scanned; the map just cannot say which signature it is.

- `skipEol` leaves out life `eol` and `last_hour`.
- `skipCrit` leaves out mass `critical`.
- `skipReduced` leaves out mass `reduced` and `critical`.
- `minShip` leaves out a hole whose size is known and smaller. A hole of
  unknown size passes.
- `skipNoSig` leaves out a hole with no signature. By default it is used, and
  a tool should mark the hop so the pilot knows there is no signature to
  look for.

Size comes from the hole type's largest mass per jump, in kilograms:

| Up to | Size |
|---|---|
| 5,000,000 | `s` |
| 62,000,000 | `m` |
| 375,000,000 | `l` |
| above | `xl` |

An EVE-Scout hole is left out by `skipEol` when it has four hours or less
remaining, and by `minShip` when its listed ship size (`small`, `medium`,
`large`, `xlarge` or `capital`, the last two both `xl`) is smaller. Unknown
remaining time or size passes.

## Systems never passed through

- Any system in `avoid`.
- **Zarzakh** (30100000): a pilot leaving it is locked to the gate they came
  in by for six hours.

Both are still allowed as the start or the end of a route.

## The nearest of a set

The end of a route can be a set of systems instead of one: the buyers of
something, say, or the trade hubs. The route is then to whichever system in
the set is cheapest to reach, by the same costs, and the result says which.

- The mode decides between them like anything else: under `safer`, a
  high-sec system several jumps away beats a low-sec one next door.
- A system in `avoid`, or Zarzakh, is not a candidate. The exception above is
  for an end the pilot named; nobody named this one.
- Standing in a system of the set is a route of no jumps, even if that system
  is in `avoid`.

A tool can ask for the nearest few instead of the nearest one: the trade
hubs in order, or the three closest buyers. They come cheapest first, one
route each. A later one may be reached through an earlier one. Under
`safer` the order is by that mode's cost, so a high-sec system can come
before a low-sec one that is fewer jumps away.

## The result

No route, or: the systems in order from start to end, and for each jump how
it was made: `gate`, `wh` or `eve_scout`, with the hole for the last two.

## Flying a route

The in-game autopilot takes gates, not wormholes, and plans its own way
between waypoints. So a tool that sets a route in EVE should:

- send every system of the gates the route starts with, in order, up to the
  first hole, and nothing beyond it. The autopilot then flies this route;
- after the pilot is through, send the gates on the far side, replacing what
  is there;
- keep the route being flown while nothing is cheaper, and take the best one
  as soon as it is not (a hole gone, a better one mapped, a preference
  changed). Two equal routes never replace each other, so EVE's route changes
  only when the map did;
- send nothing while the pilot is off the route, or while the map it would
  plan on is incomplete.

Tripwire's is `routeEngine.onward` and `tripwire.routeFollow`.

## What each tool calls these

| Model | Tripwire | Trippy | Aperture |
|---|---|---|---|
| life `eol` | `critical` | `critical` | `eolStage` not `none` |
| life `last_hour` | `<1h` | (none yet) | (a later `eolStage`) |
| mass `reduced` | `destab` | `destab` | `reduced` |
| mass `critical` | `critical` | `critical` | `critical` |
| `skipEol` | `skipEol` | `skipEol` | `avoidEol` |
| `skipCrit` | `skipCrit` | `skipCrit` | `avoidCritical` |
| `skipReduced` | `skipReduced` | `skipReduced` | `avoidReduced` |
| `skipNoSig` | `skipNoSig` | (none yet) | (none yet) |
| `minShip` | `minShip` | `minShip` | `minShipClass` |
| `mode` | `mode` | `mode` | `safety` |
| `scout` | `scout` | a list of holes | `includeEveScout` |

Known differences, as of November 2026: Aperture has no avoid list, does not
exclude Zarzakh, and applies no filters to EVE-Scout holes. Its
`avoidReduced` leaves critical mass to `avoidCritical`; here `skipReduced`
covers both, as Trippy's does. Only Tripwire routes to the nearest of a set
so far.

## The vectors

`route-vectors.json` holds small made-up maps, not EVE geography, so a static
data update cannot break them. Each case gives the systems with their bands,
the gates, the holes, any EVE-Scout holes, a start, an end, preferences, and
the expected route (`path` and `via`) or `null` for no route. Where `to` is a
list, the case is the nearest of that set; with a `count` as well, it is the
nearest that many, and `expect` is a list of routes in order. `sizeBands` lists jump masses with
the size each must give.

Every case has exactly one best route. Routers break ties in different orders
and the model does not say which is right, so a case with two equally good
routes would be a bad case.
