# Weather card backgrounds (local only)

High-quality, cinematic nature backgrounds — **dark mountain aesthetic**, no people. Used by the weather card; if a file is missing, the app uses the gradient or the fallback for the same time period (e.g. `rain_heavy_night.jpg` → `rain_heavy.jpg`). **Never** loads from the web.

## Naming convention (must match context-engine.js)

- **Day**: use base name only, e.g. `rain_light.jpg`, `rain_heavy.jpg`, `snow_light.jpg` (no `_day` suffix).
- **Night**: use `*_night.jpg`, e.g. `rain_light_night.jpg`, `snow_heavy_night.jpg`.

## Full asset library (by condition)

| Condition / API text           | Day file            | Night file (optional)     |
|--------------------------------|---------------------|----------------------------|
| **Heat / Sun**                 | `heat_day.jpg`      | —                          |
| **Clear**                      | `clear_day.jpg`     | `clear_night.jpg`          |
| **Golden hour**                | `clear_golden.jpg`  | —                          |
| **Dawn**                       | `clear_dawn.jpg`    | —                          |
| **Overcast**                   | `overcast_day.jpg`  | `overcast_night.jpg`       |
| **Overcast golden**            | `overcast_golden.jpg` | —                        |
| **Rain**                       |                     |                            |
| Light / slight rain            | `rain_light.jpg`    | `rain_light_night.jpg`     |
| Heavy / violent rain           | `rain_heavy.jpg`    | `rain_heavy_night.jpg`     |
| **Thunderstorm**               | `thunderstorm.jpg`  | (same)                     |
| **Snow**                       |                     |                            |
| Light / slight snow            | `snow_light.jpg`    | `snow_light_night.jpg`     |
| Heavy snow / snow showers     | `snow_heavy.jpg`    | `snow_heavy_night.jpg`     |
| Blizzard                       | `blizzard.jpg`      | (same)                     |
| **Ice / Hail**                 | `hail.jpg`, `sleet.jpg` | (same)                 |
| **Fog / Mist**                 | `foggy.jpg`, `mist.jpg` | (same)                 |

## Logic (context-engine.js)

- **Weather ID / description** (Open-Meteo WMO): e.g. "Light snow" → `snow_light.jpg`, "Heavy rain" → `rain_heavy.jpg`, "Heavy intensity rain" → `rain_heavy.jpg`.
- **Time sync**: `isNight` (night or golden-hour) selects `*_night.jpg` when the key exists; otherwise the day file is used.
- All of the above files are present in this folder; missing files fall back to the same condition’s day asset or gradient.
