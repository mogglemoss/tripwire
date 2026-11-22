#!/usr/bin/env python3
"""Regenerate app/js/route-presets.js: the sets of systems the Routes panel
can find the nearest of (trade hubs, blue loot buyers, red loot buyers,
security offices), with the stations in each.

Everything comes from EVE's public ESI; no key or login.

  Blue loot        stations with an NPC buy order for Sleeper Drone AI Nexus
  Red loot         stations with an NPC buy order for Triglavian Survey Database
  Security office  red loot stations that offer the security office service,
                   in low-sec: tags for security status are handed in there,
                   not at the offices in high-sec
  Trade hubs       the five market hubs, by their main station

An NPC order is one that lasts longer than a player's can (90 days).

  python3 scripts/route-presets.py            write the file
  python3 scripts/route-presets.py --check    compare with the file, write nothing
"""
import concurrent.futures as cf
import datetime
import json
import os
import re
import sys
import time
import urllib.request

ESI = "https://esi.evetech.net/latest"
HEADERS = {"User-Agent": "tripwire-route-presets", "Content-Type": "application/json"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "js", "route-presets.js")

BLUE_LOOT = 30747        # Sleeper Drone AI Nexus
RED_LOOT = 48121         # Triglavian Survey Database
RED_LOOT_ALSO = 89219    # Stability Telemetry: bought at the same stations; checked below
HUBS = [60003760, 60008494, 60011866, 60004588, 60005686]   # Jita 4-4, Amarr, Dodixie, Rens, Hek
PLAYER_ORDER_MAX_DAYS = 90
HIGH_SEC_FROM = 0.45     # true security, as the route model bands it


def get(path, body=None):
    last = None
    for attempt in range(5):
        try:
            data = json.dumps(body).encode() if body is not None else None
            req = urllib.request.Request(ESI + path, data=data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r), int(r.headers.get("X-Pages", "1"))
        except Exception as e:      # ESI drops a request now and then; anything that keeps failing is raised
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("ESI failed for " + path + ": " + str(last))


def npc_buy_orders(type_id, regions):
    def one(region):
        out, page, pages = [], 1, 1
        while page <= pages:
            data, pages = get("/markets/%d/orders/?order_type=buy&type_id=%d&page=%d" % (region, type_id, page))
            out += data
            page += 1
        return out
    with cf.ThreadPoolExecutor(8) as ex:
        orders = [o for chunk in ex.map(one, regions) for o in chunk]
    return [o for o in orders if o["duration"] > PLAYER_ORDER_MAX_DAYS]


def by_system(orders):
    out = {}
    for o in orders:
        out.setdefault(o["system_id"], set()).add(o["location_id"])
    return out


def main():
    check = "--check" in sys.argv
    regions = [r for r in get("/universe/regions/")[0] if 10000000 <= r < 11000000]

    blue = by_system(npc_buy_orders(BLUE_LOOT, regions))
    red = by_system(npc_buy_orders(RED_LOOT, regions))
    red_also = by_system(npc_buy_orders(RED_LOOT_ALSO, regions))
    if red != red_also:
        sys.exit("The two red loot items are no longer bought at the same stations; decide which the set means.")
    if not blue or not red:
        sys.exit("ESI returned no NPC buy orders; not writing an empty set.")

    red_stations = sorted({s for v in red.values() for s in v} | set(HUBS))
    with cf.ThreadPoolExecutor(8) as ex:
        info = dict(zip(red_stations, ex.map(lambda s: get("/universe/stations/%d/" % s)[0], red_stations)))
        security = dict(zip(sorted(red), ex.map(lambda s: get("/universe/systems/%d/" % s)[0]["security_status"], sorted(red))))
    sec = {}
    for system, stations in red.items():
        offices = {s for s in stations if "security-offices" in info[s].get("services", [])}
        if offices and 0 < security[system] < HIGH_SEC_FROM:
            sec[system] = offices
    hubs = {info[s]["system_id"]: {s} for s in HUBS}

    sets = {"hubs": hubs, "blue": blue, "red": red, "sec": sec}
    station_ids = sorted({s for group in sets.values() for v in group.values() for s in v})
    names = {}
    for i in range(0, len(station_ids), 500):
        for row in get("/universe/names/", station_ids[i:i + 500])[0]:
            names[row["id"]] = row["name"]
    missing = [s for s in station_ids if s not in names]
    if missing:
        sys.exit("No name from ESI for stations: " + str(missing))

    body = {
        "sets": {k: {str(system): sorted(v) for system, v in sorted(group.items())} for k, group in sets.items()},
        "stations": {str(s): names[s] for s in station_ids},
    }
    counts = ", ".join("%s %d" % (k, len(v)) for k, v in body["sets"].items())

    if check:
        old = open(OUT).read()
        same = json.loads(re.search(r"var routePresets = (\{.*\});", old, re.S).group(1))
        same.pop("generated", None)
        print(("unchanged" if same == body else "DIFFERENT from the file") + ": " + counts)
        sys.exit(0 if same == body else 1)

    data = dict(generated=datetime.date.today().isoformat(), **body)
    with open(OUT, "w") as f:
        f.write("// Sets of systems the Routes panel can find the nearest of, with the\n"
                "// stations in each: {sets: {name: {systemID: [stationID]}}, stations: {id: name}}.\n"
                "// Generated from EVE's public market and station data by\n"
                "// scripts/route-presets.py. Do not edit; run the script.\n"
                "var routePresets = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n")
    print("wrote " + os.path.relpath(OUT) + ": " + counts + ", " + str(len(station_ids)) + " stations")


if __name__ == "__main__":
    main()
